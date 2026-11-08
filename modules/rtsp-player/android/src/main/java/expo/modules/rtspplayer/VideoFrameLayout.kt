package expo.modules.rtspplayer

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import kotlin.math.roundToInt

/** Sizes the single video child for contain / cover / fill and centres it. */
class VideoFrameLayout(context: Context) : FrameLayout(context) {
  /** width / height of the video, 0 when unknown. */
  var aspect = 0f
  var mode = "contain"

  /** Digital zoom (1 = off) and pan (-1..1: left/top edge .. right/bottom edge). */
  var zoom = 1f
  var panX = 0f
  var panY = 0f

  val videoView: View?
    get() = if (childCount > 0) getChildAt(0) else null

  init {
    clipChildren = true
  }

  fun setVideoView(view: View) {
    removeAllViews()
    addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      getDefaultSize(suggestedMinimumWidth, widthMeasureSpec),
      getDefaultSize(suggestedMinimumHeight, heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val child = videoView ?: return
    val w = right - left
    val h = bottom - top
    if (w <= 0 || h <= 0) return
    var cw = w
    var ch = h
    if (aspect > 0f && mode != "fill") {
      val viewAspect = w.toFloat() / h
      val fitWidth = if (mode == "contain") aspect > viewAspect else aspect < viewAspect
      if (fitWidth) {
        ch = (w / aspect).roundToInt()
      } else {
        cw = (h * aspect).roundToInt()
      }
    }
    // Zoom by laying the video out larger than the frame; works for TextureView and SurfaceView
    // (the display crops whatever falls outside the screen).
    cw = (cw * zoom).roundToInt()
    ch = (ch * zoom).roundToInt()
    val spareX = maxOf(0, cw - w) / 2f
    val spareY = maxOf(0, ch - h) / 2f
    val x = ((w - cw) / 2f - panX * spareX).roundToInt()
    val y = ((h - ch) / 2f - panY * spareY).roundToInt()
    child.measure(MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY))
    child.layout(x, y, x + cw, y + ch)
  }
}
