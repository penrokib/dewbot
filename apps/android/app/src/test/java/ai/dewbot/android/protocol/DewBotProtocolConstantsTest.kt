package ai.dewbot.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class DewBotProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", DewBotCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", DewBotCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", DewBotCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", DewBotCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", DewBotCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", DewBotCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", DewBotCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", DewBotCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", DewBotCapability.Canvas.rawValue)
    assertEquals("camera", DewBotCapability.Camera.rawValue)
    assertEquals("screen", DewBotCapability.Screen.rawValue)
    assertEquals("voiceWake", DewBotCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", DewBotScreenCommand.Record.rawValue)
  }
}
