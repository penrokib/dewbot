type StateDirEnvSnapshot = {
  dewbotStateDir: string | undefined;
  dewbotStateDir: string | undefined;
};

export function snapshotStateDirEnv(): StateDirEnvSnapshot {
  return {
    dewbotStateDir: process.env.DEWBOT_STATE_DIR,
    dewbotStateDir: process.env.DEWBOT_STATE_DIR,
  };
}

export function restoreStateDirEnv(snapshot: StateDirEnvSnapshot): void {
  if (snapshot.dewbotStateDir === undefined) {
    delete process.env.DEWBOT_STATE_DIR;
  } else {
    process.env.DEWBOT_STATE_DIR = snapshot.dewbotStateDir;
  }
  if (snapshot.dewbotStateDir === undefined) {
    delete process.env.DEWBOT_STATE_DIR;
  } else {
    process.env.DEWBOT_STATE_DIR = snapshot.dewbotStateDir;
  }
}

export function setStateDirEnv(stateDir: string): void {
  process.env.DEWBOT_STATE_DIR = stateDir;
  delete process.env.DEWBOT_STATE_DIR;
}
