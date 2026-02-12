#!/bin/bash
# DewBot Local Model Training Pipeline
# Fine-tunes Llama-3.2-3B-Instruct for fast business operations
#
# Prerequisites:
# - Python 3.10+
# - CUDA-capable GPU (16GB+ VRAM recommended)
# - pip install transformers peft datasets accelerate bitsandbytes
#
# Usage:
#   ./scripts/train-dewbot-model.sh
#   EPOCHS=5 BATCH_SIZE=8 ./scripts/train-dewbot-model.sh
#   BASE_MODEL=meta-llama/Llama-3.2-1B-Instruct ./scripts/train-dewbot-model.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEWX_DIR="${DEWX_DIR:-$SCRIPT_DIR/../../dewx}"
OUTPUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR/../models/dew-unified-3b}"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/../data/training}"
BASE_MODEL="${BASE_MODEL:-meta-llama/Llama-3.2-3B-Instruct}"
EPOCHS="${EPOCHS:-3}"
BATCH_SIZE="${BATCH_SIZE:-4}"
LEARNING_RATE="${LEARNING_RATE:-2e-4}"
LORA_R="${LORA_R:-16}"
LORA_ALPHA="${LORA_ALPHA:-32}"

echo "==============================================="
echo "  DewBot Model Training Pipeline"
echo "==============================================="
echo ""
echo "Base model:    $BASE_MODEL"
echo "Output:        $OUTPUT_DIR"
echo "Data dir:      $DATA_DIR"
echo "Dewx source:   $DEWX_DIR"
echo "Epochs:        $EPOCHS"
echo "Batch size:    $BATCH_SIZE"
echo "Learning rate: $LEARNING_RATE"
echo "LoRA r:        $LORA_R"
echo "LoRA alpha:    $LORA_ALPHA"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Generate training data from Dewx training generators
# ---------------------------------------------------------------------------
echo "[Step 1/5] Generating training data..."
mkdir -p "$DATA_DIR"

if [ ! -d "$DEWX_DIR/apps/dew/ai/src/training" ]; then
  echo "ERROR: Dewx training directory not found at $DEWX_DIR/apps/dew/ai/src/training"
  echo "Set DEWX_DIR to your dewx repo root."
  exit 1
fi

# Run the unified merger which combines all domain generators
cd "$DEWX_DIR"

# Check if unified_training_data already exists and is recent (< 1 hour old)
UNIFIED_DIR="$DEWX_DIR/apps/dew/ai/src/training/unified_training_data"
REGEN=1
if [ -f "$UNIFIED_DIR/train.jsonl" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$UNIFIED_DIR/train.jsonl" 2>/dev/null || stat -c %Y "$UNIFIED_DIR/train.jsonl" 2>/dev/null || echo 0) ))
  if [ "$AGE" -lt 3600 ]; then
    echo "  Using existing unified data (generated ${AGE}s ago)"
    REGEN=0
  fi
fi

if [ "$REGEN" -eq 1 ]; then
  echo "  Running unified merger..."
  npx ts-node apps/dew/ai/src/training/unified-merger.ts \
    "apps/dew/ai/src/training" \
    "$UNIFIED_DIR" 2>&1 | tail -20
fi

# Copy unified data to our data directory
if [ -f "$UNIFIED_DIR/train.jsonl" ]; then
  cp "$UNIFIED_DIR/train.jsonl" "$DATA_DIR/all-data.jsonl"
  # Append val and test if they exist (we will re-split anyway)
  [ -f "$UNIFIED_DIR/val.jsonl" ] && cat "$UNIFIED_DIR/val.jsonl" >> "$DATA_DIR/all-data.jsonl"
  [ -f "$UNIFIED_DIR/test.jsonl" ] && cat "$UNIFIED_DIR/test.jsonl" >> "$DATA_DIR/all-data.jsonl"
else
  echo "ERROR: Unified merger did not produce train.jsonl"
  echo "Check that individual generators have been run first."
  exit 1
fi

TOTAL=$(wc -l < "$DATA_DIR/all-data.jsonl" | tr -d ' ')
echo "  Generated $TOTAL total examples"

if [ "$TOTAL" -lt 10 ]; then
  echo "ERROR: Too few training examples ($TOTAL). Need at least 10."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Split into train/val/test (60/20/20)
# ---------------------------------------------------------------------------
echo ""
echo "[Step 2/5] Splitting dataset (60/20/20)..."

# Shuffle first for randomness
if command -v shuf &> /dev/null; then
  shuf "$DATA_DIR/all-data.jsonl" > "$DATA_DIR/all-data-shuffled.jsonl"
else
  # macOS fallback: use sort -R or awk-based shuffle
  awk 'BEGIN{srand()}{print rand()"\t"$0}' "$DATA_DIR/all-data.jsonl" | sort -n | cut -f2- > "$DATA_DIR/all-data-shuffled.jsonl"
fi
mv "$DATA_DIR/all-data-shuffled.jsonl" "$DATA_DIR/all-data.jsonl"

TRAIN_END=$((TOTAL * 60 / 100))
VAL_END=$((TOTAL * 80 / 100))

head -n "$TRAIN_END" "$DATA_DIR/all-data.jsonl" > "$DATA_DIR/train.jsonl"
tail -n +"$((TRAIN_END + 1))" "$DATA_DIR/all-data.jsonl" | head -n "$((VAL_END - TRAIN_END))" > "$DATA_DIR/val.jsonl"
tail -n +"$((VAL_END + 1))" "$DATA_DIR/all-data.jsonl" > "$DATA_DIR/test.jsonl"

TRAIN_COUNT=$(wc -l < "$DATA_DIR/train.jsonl" | tr -d ' ')
VAL_COUNT=$(wc -l < "$DATA_DIR/val.jsonl" | tr -d ' ')
TEST_COUNT=$(wc -l < "$DATA_DIR/test.jsonl" | tr -d ' ')

echo "  Train: $TRAIN_COUNT | Val: $VAL_COUNT | Test: $TEST_COUNT"

# ---------------------------------------------------------------------------
# Step 3: Fine-tune with QLoRA
# ---------------------------------------------------------------------------
echo ""
echo "[Step 3/5] Fine-tuning with QLoRA..."
mkdir -p "$OUTPUT_DIR"

python3 - <<'TRAIN_SCRIPT'
import json
import sys
import os
import time

# ---- Dependency check ----
missing = []
try:
    import torch
except ImportError:
    missing.append("torch")
try:
    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
except ImportError:
    missing.append("transformers")
try:
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
except ImportError:
    missing.append("peft")
try:
    from datasets import load_dataset
except ImportError:
    missing.append("datasets")
try:
    import bitsandbytes
except ImportError:
    missing.append("bitsandbytes")

if missing:
    print(f"Missing dependencies: {', '.join(missing)}", file=sys.stderr)
    print("Install with: pip install transformers peft datasets accelerate bitsandbytes torch", file=sys.stderr)
    sys.exit(1)

from transformers import BitsAndBytesConfig

# ---- Configuration from environment ----
data_dir = os.environ.get("DATA_DIR", "data/training")
output_dir = os.environ.get("OUTPUT_DIR", "models/dew-unified-3b")
base_model = os.environ.get("BASE_MODEL", "meta-llama/Llama-3.2-3B-Instruct")
epochs = int(os.environ.get("EPOCHS", "3"))
batch_size = int(os.environ.get("BATCH_SIZE", "4"))
lr = float(os.environ.get("LEARNING_RATE", "2e-4"))
lora_r = int(os.environ.get("LORA_R", "16"))
lora_alpha = int(os.environ.get("LORA_ALPHA", "32"))

print(f"Configuration:")
print(f"  Base model:    {base_model}")
print(f"  Data dir:      {data_dir}")
print(f"  Output dir:    {output_dir}")
print(f"  Epochs:        {epochs}")
print(f"  Batch size:    {batch_size}")
print(f"  Learning rate: {lr}")
print(f"  LoRA r={lora_r}, alpha={lora_alpha}")
print()

# ---- Check CUDA availability ----
if torch.cuda.is_available():
    device_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024**3)
    print(f"GPU: {device_name} ({vram_gb:.1f} GB VRAM)")
elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    print("Device: Apple Silicon (MPS)")
    print("  Note: 4-bit quantization not supported on MPS, using float16")
else:
    print("WARNING: No GPU detected. Training will be very slow on CPU.")
    print("  Consider using a CUDA-capable GPU or Apple Silicon Mac.")

# ---- Determine quantization config ----
use_4bit = torch.cuda.is_available()
bnb_config = None
if use_4bit:
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    compute_dtype = torch.bfloat16
else:
    compute_dtype = torch.float16

# ---- Load tokenizer ----
print(f"Loading tokenizer: {base_model}")
tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.pad_token_id = tokenizer.eos_token_id

# ---- Load model ----
print(f"Loading model: {base_model}")
load_start = time.time()

model_kwargs = {
    "torch_dtype": compute_dtype,
    "device_map": "auto",
    "trust_remote_code": True,
}
if bnb_config:
    model_kwargs["quantization_config"] = bnb_config

model = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)

if use_4bit:
    model = prepare_model_for_kbit_training(model)

load_time = time.time() - load_start
print(f"Model loaded in {load_time:.1f}s")

# ---- Apply LoRA ----
lora_config = LoraConfig(
    r=lora_r,
    lora_alpha=lora_alpha,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# ---- Load and tokenize datasets ----
print("\nLoading datasets...")
dataset = load_dataset("json", data_files={
    "train": f"{data_dir}/train.jsonl",
    "validation": f"{data_dir}/val.jsonl",
})
print(f"  Train: {len(dataset['train'])} examples")
print(f"  Val:   {len(dataset['validation'])} examples")

MAX_LENGTH = 2048

def tokenize(example):
    """Convert ChatML messages to tokenized input with labels."""
    messages = example["messages"]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    result = tokenizer(
        text,
        truncation=True,
        max_length=MAX_LENGTH,
        padding="max_length",
    )
    result["labels"] = result["input_ids"].copy()
    return result

print("Tokenizing...")
tokenized = dataset.map(
    tokenize,
    remove_columns=dataset["train"].column_names,
    num_proc=min(os.cpu_count() or 1, 4),
    desc="Tokenizing",
)

# ---- Training arguments ----
training_args = TrainingArguments(
    output_dir=output_dir,
    num_train_epochs=epochs,
    per_device_train_batch_size=batch_size,
    per_device_eval_batch_size=batch_size,
    gradient_accumulation_steps=4,
    eval_strategy="steps",
    eval_steps=100,
    save_steps=200,
    logging_steps=25,
    learning_rate=lr,
    weight_decay=0.01,
    warmup_steps=50,
    lr_scheduler_type="cosine",
    bf16=torch.cuda.is_available(),
    fp16=not torch.cuda.is_available() and not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()),
    report_to="none",
    save_total_limit=3,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    greater_is_better=False,
    dataloader_num_workers=2,
    remove_unused_columns=False,
)

# ---- Train ----
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized["train"],
    eval_dataset=tokenized["validation"],
    tokenizer=tokenizer,
)

print("\nStarting training...")
train_start = time.time()
train_result = trainer.train()
train_time = time.time() - train_start

print(f"\nTraining completed in {train_time:.1f}s ({train_time/60:.1f} min)")
print(f"  Final train loss: {train_result.training_loss:.4f}")

# ---- Save ----
final_dir = f"{output_dir}/final"
print(f"\nSaving model to {final_dir}")
trainer.save_model(final_dir)
tokenizer.save_pretrained(final_dir)

# Save training metadata
import json as json_mod
metadata = {
    "base_model": base_model,
    "epochs": epochs,
    "batch_size": batch_size,
    "learning_rate": lr,
    "lora_r": lora_r,
    "lora_alpha": lora_alpha,
    "max_length": MAX_LENGTH,
    "train_examples": len(dataset["train"]),
    "val_examples": len(dataset["validation"]),
    "training_loss": train_result.training_loss,
    "training_time_seconds": round(train_time, 1),
    "trainable_params": sum(p.numel() for p in model.parameters() if p.requires_grad),
    "total_params": sum(p.numel() for p in model.parameters()),
}
with open(f"{final_dir}/training-metadata.json", "w") as f:
    json_mod.dump(metadata, f, indent=2)

print(f"Model and metadata saved to {final_dir}")
TRAIN_SCRIPT

# ---------------------------------------------------------------------------
# Step 4: Evaluate (quick sanity check)
# ---------------------------------------------------------------------------
echo ""
echo "[Step 4/5] Evaluating model..."
if [ -f "$SCRIPT_DIR/eval-dewbot-model.ts" ]; then
  echo "  Run full evaluation with:"
  echo "    1. Start the model server:"
  echo "       python -m vllm.entrypoints.openai.api_server \\"
  echo "         --model $OUTPUT_DIR/final --port 8765"
  echo "    2. Run eval:"
  echo "       npx ts-node scripts/eval-dewbot-model.ts --model-url http://localhost:8765"
else
  echo "  Evaluation script not found. Skipping."
fi

# Quick validation: check that the model directory has the expected files
echo ""
echo "  Checking output files..."
EXPECTED_FILES=("adapter_config.json" "adapter_model.safetensors" "tokenizer.json" "training-metadata.json")
MISSING=0
for f in "${EXPECTED_FILES[@]}"; do
  if [ -f "$OUTPUT_DIR/final/$f" ]; then
    SIZE=$(du -sh "$OUTPUT_DIR/final/$f" 2>/dev/null | cut -f1)
    echo "    [OK] $f ($SIZE)"
  else
    echo "    [MISSING] $f"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "  WARNING: $MISSING expected files missing. Training may have failed."
fi

# ---------------------------------------------------------------------------
# Step 5: Summary
# ---------------------------------------------------------------------------
echo ""
echo "==============================================="
echo "  Training Complete!"
echo "==============================================="
echo ""
echo "Model output:  $OUTPUT_DIR/final"
echo "Training data: $DATA_DIR"
echo "  Train:  $TRAIN_COUNT examples"
echo "  Val:    $VAL_COUNT examples"
echo "  Test:   $TEST_COUNT examples"
echo ""
echo "Next steps:"
echo ""
echo "  1. Serve with vLLM (GPU):"
echo "     python -m vllm.entrypoints.openai.api_server \\"
echo "       --model $OUTPUT_DIR/final \\"
echo "       --port 8765 \\"
echo "       --max-model-len 2048"
echo ""
echo "  2. Serve with llama.cpp (CPU/Metal):"
echo "     # Convert to GGUF first"
echo "     python convert_lora_to_gguf.py $OUTPUT_DIR/final"
echo ""
echo "  3. Evaluate:"
echo "     npx ts-node scripts/eval-dewbot-model.ts \\"
echo "       --model-url http://localhost:8765"
echo ""
echo "  4. Merge LoRA into base model (optional):"
echo "     python -c \""
echo "       from peft import PeftModel"
echo "       from transformers import AutoModelForCausalLM"
echo "       base = AutoModelForCausalLM.from_pretrained('$BASE_MODEL')"
echo "       model = PeftModel.from_pretrained(base, '$OUTPUT_DIR/final')"
echo "       merged = model.merge_and_unload()"
echo "       merged.save_pretrained('$OUTPUT_DIR/merged')"
echo "     \""
