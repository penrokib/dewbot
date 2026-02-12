package ai.dewbot.android.ui

import androidx.compose.runtime.Composable
import ai.dewbot.android.MainViewModel
import ai.dewbot.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
