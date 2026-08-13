package com.example

import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme {
        Surface(
          modifier = Modifier.fillMaxSize(),
          color = MaterialTheme.colorScheme.background
        ) {
          GameWebView()
        }
      }
    }
  }
}

@Composable
fun GameWebView() {
  AndroidView(
    modifier = Modifier.fillMaxSize(),
    factory = { context ->
      // Serve the bundled web app from a real https origin instead of file://.
      // ES-module scripts are CORS-blocked from file:// (origin "null"), which
      // left the WebView showing only index.html's background color — the JS
      // bundle never executed. WebViewAssetLoader maps
      // https://appassets.androidplatform.net/assets/* to the APK's asset dir,
      // giving the page a secure origin where modules, fetch and localStorage
      // all behave normally.
      val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

      WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          useWideViewPort = true
          loadWithOverviewMode = true
        }
        webViewClient = object : WebViewClientCompat() {
          override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
          ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }
        webChromeClient = WebChromeClient()
        // Inspectable from chrome://inspect on a connected machine.
        WebView.setWebContentsDebuggingEnabled(true)
        loadUrl("https://appassets.androidplatform.net/assets/index.html")
      }
    }
  )
}
