package expo.modules.rtspplayer

import android.app.Activity
import android.view.KeyEvent
import android.widget.EditText

/**
 * Number keys on TV remotes (react-native-tvos doesn't forward them). MainActivity calls
 * [handle] from dispatchKeyEvent (patched in by plugins/withRemoteKeys.js).
 */
object RemoteKeys {
  @Volatile
  var listener: ((Int) -> Unit)? = null

  /** Returns true when the key was consumed. */
  @JvmStatic
  fun handle(activity: Activity, event: KeyEvent): Boolean {
    val l = listener ?: return false
    // Typing an IP address with the remote's number pad must keep working.
    if (activity.currentFocus is EditText) return false
    val digit = when (event.keyCode) {
      in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> event.keyCode - KeyEvent.KEYCODE_0
      in KeyEvent.KEYCODE_NUMPAD_0..KeyEvent.KEYCODE_NUMPAD_9 -> event.keyCode - KeyEvent.KEYCODE_NUMPAD_0
      else -> return false
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) l(digit)
    return true
  }
}
