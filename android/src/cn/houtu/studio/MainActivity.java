package cn.houtu.studio;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.webkit.CookieManager;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

public final class MainActivity extends Activity {
  WebView web, engine;
  LinearLayout root, nav;
  TextView message;
  ValueCallback<Uri[]> chooser;
  String downloadUrl, downloadMime;
  byte[] downloadBytes;
  WebMessagePort documents;
  Uri lastSaved;
  String lastMime;
  boolean ready = false;
  boolean unifiedPage = false;
  boolean updatesForeground = false;
  final Handler updatesHandler = new Handler(Looper.getMainLooper());
  final Runnable automaticUpdates = new Runnable() {
    public void run() { if (updatesForeground && !isFinishing()) {
      AndroidUpdates.check(MainActivity.this, true);
      updatesHandler.postDelayed(this, UpdatePolicy.AUTO_INTERVAL_MS);
    } }
  };


  public void onCreate(Bundle b) {
    super.onCreate(b);
    WebView.setWebContentsDebuggingEnabled(
        (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
    RuntimeHost.activity = this;
    if (b != null && b.containsKey("downloadPath")) {
      downloadUrl = b.getString("downloadPath");
      downloadMime = b.getString("downloadMime", "application/octet-stream");
    }
    boolean dark =
        (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(dark ? Color.rgb(22, 27, 31) : Color.rgb(247, 246, 242));
    setContentView(root);
    root.setOnApplyWindowInsetsListener(
        (v, in) -> {
          if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars =
                in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            if (nav != null)
              nav.setVisibility(unifiedPage || in.isVisible(WindowInsets.Type.ime()) ? View.GONE : View.VISIBLE);
            return new WindowInsets.Builder(in)
                .setInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout(),
                    android.graphics.Insets.NONE)
                .setDisplayCutout(null)
                .build();
          } else
            v.setPadding(
                in.getSystemWindowInsetLeft(),
                in.getSystemWindowInsetTop(),
                in.getSystemWindowInsetRight(),
                in.getSystemWindowInsetBottom());
          return in.consumeSystemWindowInsets().consumeDisplayCutout();
        });
    LinearLayout top = new LinearLayout(this);
    top.setGravity(Gravity.CENTER_VERTICAL);
    TextView title = new TextView(this);
    title.setText("厚涂小站  ·  手机本地");
    title.setTextSize(18);
    title.setPadding(dp(18), 0, 0, 0);
    top.addView(title, new LinearLayout.LayoutParams(0, dp(52), 1));
    Button more = new Button(this);
    more.setText("更多");
    more.setContentDescription("更多工作台与应用设置");
    more.setOnClickListener(v -> menu(more));
    top.addView(more, new LinearLayout.LayoutParams(dp(72), dp(48)));
    root.addView(top);
    message = new TextView(this);
    message.setText("正在启动手机图片引擎…\n首次启动需要整理本机资源。");
    message.setTextSize(16);
    message.setGravity(Gravity.CENTER);
    message.setPadding(dp(24), dp(32), dp(24), dp(32));
    root.addView(message, new LinearLayout.LayoutParams(-1, 0, 1));
    web = new WebView(this);
    settings(web);
    web.setVisibility(View.GONE);
    root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    web.setWebViewClient(
        new WebViewClient() {
          public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            String url = r.getUrl().toString();
            if (own(url)) return false;
            if (r.isForMainFrame() && r.hasGesture()) openExternal(url);
            return true;
          }

          public void onPageFinished(WebView v, String u) {
            if (own(u)) {
              unifiedPage = "/workbench/".equals(Uri.parse(u).getPath());
              if (nav != null) nav.setVisibility(unifiedPage ? View.GONE : View.VISIBLE);
              attachDownloads();
            }
          }

          public void onReceivedSslError(
              WebView v, android.webkit.SslErrorHandler h, android.net.http.SslError e) {
            h.cancel();
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          public boolean onShowFileChooser(
              WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (chooser != null) chooser.onReceiveValue(null);
            chooser = callback;
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            java.util.LinkedHashSet<String> types = new java.util.LinkedHashSet<>();
            for (String group : params.getAcceptTypes())
              for (String candidate : group.split(",")) {
                String value = candidate.trim().toLowerCase(java.util.Locale.ROOT);
                if (value.equals(".png")) value = "image/png";
                else if (value.equals(".jpg") || value.equals(".jpeg")) value = "image/jpeg";
                else if (value.equals(".webp")) value = "image/webp";
                else if (value.equals(".json")) value = "application/json";
                else if (value.equals(".txt") || value.equals(".cube")) value = "text/plain";
                if (value.matches("[a-z0-9.+*-]+/[a-z0-9.+*-]+")) types.add(value);
              }
            if (java.util.Arrays.toString(params.getAcceptTypes()).toLowerCase(java.util.Locale.ROOT).contains(".dng")) { types.clear(); types.add("*/*"); }
            String type = types.size() == 1 ? types.iterator().next() : "*/*";
            pick.setType(type);
            if (types.size() > 1)
              pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            pick.putExtra(
                Intent.EXTRA_ALLOW_MULTIPLE,
                params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
              startActivityForResult(pick, 1);
              return true;
            } catch (Exception e) {
              chooser.onReceiveValue(null);
              chooser = null;
              toast("此手机没有可用的文件选择器。");
              return true;
            }
          }

          public boolean onCreateWindow(
              WebView view, boolean dialog, boolean user, android.os.Message result) {
            if (!user || !own(view.getUrl())) return false;
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(
                new WebViewClient() {
                  public boolean shouldOverrideUrlLoading(WebView v, String url) {
                    openExternal(url);
                    v.destroy();
                    return true;
                  }
                });
            ((WebView.WebViewTransport) result.obj).setWebView(popup);
            result.sendToTarget();
            return true;
          }
        });
    web.setDownloadListener(
        (url, ua, disposition, mime, size) -> {
          if (!own(url)) {
            toast("请选择本机工作台的下载文件。");
            return;
          }
          String filename = URLUtil.guessFileName(url, disposition, mime);
          chooseSave(filename, mime, url, null);
        });
    nav = new LinearLayout(this);
    for (String[] item :
        new String[][] {
          {"人物修图", "/portrait/"}, {"调色", "/color/"}, {"AI修图", "/ai/"}, {"工作流", "/workflows/?section=ai"}
        }) {
      Button button = new Button(this);
      button.setText(item[0]);
      button.setTextSize(13);
      button.setPadding(0, 0, 0, 0);
      button.setOnClickListener(v -> go(item[1]));
      nav.addView(button, new LinearLayout.LayoutParams(0, dp(52), 1));
    }
    root.addView(nav);
    nav.setVisibility(View.GONE);
    RuntimeHost.start(this);
    if (RuntimeHost.origin != null) runtimeReady();
    else if (RuntimeHost.error != null) runtimeFailed(RuntimeHost.error);
  }

  void settings(WebView v) {
    WebSettings s = v.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(true);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setSupportMultipleWindows(true);
    s.setJavaScriptCanOpenWindowsAutomatically(false);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setOffscreenPreRaster(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(v, false);
  }

  void runtimeReady() {
    if (ready || isFinishing()) return;
    ready = true;
    CookieManager.getInstance()
        .setCookie(
            RuntimeHost.origin,
            "houtu_local=" + RuntimeHost.token + "; Path=/; HttpOnly; SameSite=Strict",
            ok -> {
              if (!Boolean.TRUE.equals(ok)) {
                ready = false;
                runtimeFailed("本机访问验证未建立，请重新打开应用。");
                return;
              }
              message.setVisibility(View.GONE);
              web.setVisibility(View.VISIBLE);
              nav.setVisibility(View.VISIBLE);
              web.loadUrl(RuntimeHost.origin + "/workbench/");
              engine = RuntimeHost.engine;
              if (engine == null) {
                engine = new WebView(getApplicationContext());
                RuntimeHost.engine = engine;
              }
              settings(engine);
              engine.setAlpha(0);
              if (engine.getParent() != null) ((ViewGroup) engine.getParent()).removeView(engine);
              root.addView(engine, new LinearLayout.LayoutParams(1, 1));
              engine.setWebViewClient(new RuntimeHost.EngineClient());
              if (engine.getUrl() == null)
                engine.loadUrl(RuntimeHost.origin + "/vision-target.html");
              requestTaskNotifications();
            });
  }

  void runtimeFailed(String error) {
    message.setVisibility(View.VISIBLE);
    message.setText("本机图片引擎尚未启动\n\n" + error + "\n\n可在“更多 → 复制诊断”查看状态。");
  }

  boolean own(String value) {
    if (value == null || RuntimeHost.origin == null) return false;
    try {
      Uri a = Uri.parse(value), b = Uri.parse(RuntimeHost.origin);
      return a.getScheme().equals(b.getScheme())
          && a.getHost().equals(b.getHost())
          && a.getPort() == b.getPort();
    } catch (Exception e) {
      return false;
    }
  }

  void go(String path) {
    if (ready) web.evaluateJavascript("window.houtuWorkspaceNavigate ? window.houtuWorkspaceNavigate(" + JSONObject.quote(path) + ") : location.assign(" + JSONObject.quote(RuntimeHost.origin + path) + ")", null);
  }

  void openExternal(String value) {
    try {
      Uri uri = Uri.parse(value);
      if (!"https".equals(uri.getScheme())) {
        toast("仅支持打开 HTTPS 网页。");
        return;
      }
      startActivity(new Intent(Intent.ACTION_VIEW, uri));
    } catch (Exception e) {
      toast("此手机没有可用的浏览器。");
    }
  }

  void menu(View anchor) {
    PopupMenu p = new PopupMenu(this, anchor);
    String[] titles = {"AI特效与合成", "工作流管理", "图片档案", "提示词实验室", "检查安卓版更新", "分享最近成片", "复制诊断", "照片项目", "超分4K"};
    for (int i = 0; i < titles.length; i++) p.getMenu().add(0, i, i, titles[i]);
    p.getMenu().add(0, 10, 10, "本机图层合成");
    p.getMenu().add(0, 11, 11, "功能中心");
    p.getMenu().add(0, 12, 12, "单画布工作台");
    p.getMenu().add(0, 9, 9, "自动检查GitHub更新").setCheckable(true).setChecked(AndroidUpdates.enabled(this));
    p.setOnMenuItemClickListener(
        item -> {
          switch (item.getItemId()) {
            case 0:
              go("/creative/");
              break;
            case 1:
              go("/workflows/");
              break;
            case 2:
              go("/server/");
              break;
            case 3:
              go("/lab/");
              break;
            case 4:
              AndroidUpdates.check(this);
              break;
            case 10:
              go("/layers/");
              break;
            case 12:
              go("/workbench/");
              break;
            case 11:
              go("/features/");
              break;
            case 9:
              AndroidUpdates.configure(this, !AndroidUpdates.enabled(this));
              break;
            case 5:
              if (lastSaved != null) {
                Intent share =
                    new Intent(Intent.ACTION_SEND)
                        .setType(lastMime)
                        .putExtra(Intent.EXTRA_STREAM, lastSaved)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(share, "分享成片"));
              } else toast("保存一张成片后可分享。");
              break;
            case 7:
              go("/studio/");
              break;
            case 8:
              go("/upscale/");
              break;
            case 6:
              copy(
                  "厚涂小站 Android\n系统 "
                      + Build.VERSION.RELEASE
                      + " / "
                      + Build.SUPPORTED_ABIS[0]
                      + "\n运行时 "
                      + (RuntimeHost.error != null ? RuntimeHost.error : ready ? "已启动" : "准备中")
                      + "\n数据位于本应用私有目录，不依赖电脑。");
              break;
          }
          return true;
        });
    p.show();
  }

  void attachDownloads() {
    if (!own(web.getUrl())) return;
    if (documents != null) documents.close();
    String nonce = "houtu-documents-" + RuntimeHost.random(), quoted = JSONObject.quote(nonce);
    String script =
        "window.addEventListener('message',function receive(e){if(e.data!=="
            + quoted
            + "||e.ports.length!==1||(e.source&&e.source!==window))return;window.removeEventListener('message',receive);window.houtuDocuments=e.ports[0];window.dispatchEvent(new Event('houtu:documents-ready'));});";
    web.evaluateJavascript(
        script,
        unused -> {
          WebMessagePort[] ports = web.createWebMessageChannel();
          documents = ports[0];
          ports[0].setWebMessageCallback(
              new WebMessagePort.WebMessageCallback() {
                public void onMessage(WebMessagePort port, WebMessage m) {
                  if (!own(web.getUrl())) return;
                  String raw = m.getData();
                  if (raw == null || raw.length() > 65536) return;
                  try {
                    JSONObject q = new JSONObject(raw);
                    String type = q.optString("type");
                    if (type.equals("updatesStatus")) { AndroidUpdates.publish(MainActivity.this); return; }
                    if (type.equals("checkUpdates")) { AndroidUpdates.details(MainActivity.this); return; }
                    if (type.equals("dismissUpdate")) { AndroidUpdates.dismiss(MainActivity.this, q.optString("version")); return; }
                    if (type.equals("open")) {
                      openExternal(q.optString("url"));
                      return;
                    }
                    if (type.equals("copy")) {
                      String value = q.optString("text");
                      if (value.length() < 30000) copy(value);
                      return;
                    }
                    if (type.equals("saveUrl")) {
                      String url = q.optString("url");
                      if (!own(url)) throw new IOException("只能保存本机工作台的文件。");
                      chooseSave(
                          q.optString("name", "导出文件"),
                          q.optString("mime", "application/octet-stream"),
                          url,
                          null);
                    }
                  } catch (Exception e) {
                    toast("保存未开始：" + e.getMessage());
                  }
                }
              });
          web.postWebMessage(
              new WebMessage(nonce, new WebMessagePort[] {ports[1]}),
              Uri.parse(RuntimeHost.origin));
        });
  }

  void chooseSave(String name, String mime, String url, byte[] bytes) {
    if (downloadUrl != null || downloadBytes != null) {
      toast("请先完成当前文件保存。");
      return;
    }
    downloadUrl = url;
    downloadBytes = bytes;
    downloadMime = mime == null ? "application/octet-stream" : mime;
    Intent i =
        new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(downloadMime)
            .putExtra(
                Intent.EXTRA_TITLE,
                name.replaceAll("[\\\\/\\r\\n]", "_").substring(0, Math.min(160, name.length())));
    try {
      startActivityForResult(i, 2);
    } catch (Exception e) {
      downloadUrl = null;
      downloadBytes = null;
      toast("无法打开系统保存位置。");
    }
  }

  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    if (downloadUrl != null && own(downloadUrl)) {
      Uri uri = Uri.parse(downloadUrl);
      out.putString(
          "downloadPath",
          uri.getEncodedPath()
              + (uri.getEncodedQuery() == null ? "" : "?" + uri.getEncodedQuery()));
      out.putString("downloadMime", downloadMime);
    }
  }

  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 4) {
      AndroidUpdates.resumed(this);
      return;
    }
    if (request == 1) {
      ValueCallback<Uri[]> callback = chooser;
      chooser = null;
      if (callback == null) return;
      if (result != RESULT_OK || data == null) {
        callback.onReceiveValue(null);
        return;
      }
      ArrayList<Uri> uris = new ArrayList<>();
      if (data.getClipData() != null)
        for (int i = 0; i < data.getClipData().getItemCount(); i++) {
          Uri u = data.getClipData().getItemAt(i).getUri();
          if ("content".equals(u.getScheme())) uris.add(u);
        }
      else if (data.getData() != null && "content".equals(data.getData().getScheme()))
        uris.add(data.getData());
      callback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
    }
    if (request == 2) {
      String url = downloadUrl, mime = downloadMime;
      byte[] bytes = downloadBytes;
      downloadUrl = null;
      downloadBytes = null;
      if (result != RESULT_OK || data == null || data.getData() == null) return;
      Uri destination = data.getData();
      RuntimeHost.transfersCancelled = false;
      RuntimeHost.nativeOperations.incrementAndGet();
      RuntimeHost.io.execute(
          () -> {
            try {
              for (int wait = 0; RuntimeHost.origin == null && wait < 300; wait++)
                Thread.sleep(200);
              if (RuntimeHost.origin == null) throw new IOException("本机引擎仍在启动，请稍后从工作流下载。");
              try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                if (out == null) throw new IOException("无法写入所选位置。");
                if (bytes != null) out.write(bytes);
                else {
                  HttpURLConnection c =
                      (HttpURLConnection)
                          new URL(url.startsWith("/") ? RuntimeHost.origin + url : url)
                              .openConnection();
                  c.setRequestProperty("Authorization", "Bearer " + RuntimeHost.token);
                  c.setInstanceFollowRedirects(false);
                  c.setConnectTimeout(15000);
                  c.setReadTimeout(120000);
                  try {
                    if (c.getResponseCode() != 200) throw new IOException("成片暂不可用，请重新打开结果。");
                    try (InputStream in = c.getInputStream()) {
                      byte[] buffer = new byte[65536];
                      long count = 0;
                      java.security.MessageDigest hash =
                          java.security.MessageDigest.getInstance("SHA-256");
                      int n;
                      while ((n = in.read(buffer)) != -1) {
                        if (RuntimeHost.transfersCancelled)
                          throw new IOException("处理已中断，请从工作流重新下载。");
                        count += n;
                        if (count > 3L * 1024 * 1024 * 1024) throw new IOException("文件过大。");
                        out.write(buffer, 0, n);
                        hash.update(buffer, 0, n);
                      }
                      if (c.getContentLengthLong() >= 0 && count != c.getContentLengthLong())
                        throw new IOException("下载文件不完整。");
                      String expected = c.getHeaderField("X-Houtu-Content-SHA256");
                      if (expected != null
                          && !expected.equalsIgnoreCase(AndroidUpdates.hex(hash.digest())))
                        throw new IOException("成片校验未通过。");
                    }
                  } finally {
                    c.disconnect();
                  }
                }
                lastSaved = destination;
                lastMime = mime;
                runOnUiThread(() -> toast("已保存，可在“更多”中分享成片。"));
              }
            } catch (Exception e) {
              runOnUiThread(() -> toast("保存未完成：" + e.getMessage()));
            } finally {
              RuntimeHost.nativeOperations.decrementAndGet();
            }
          });
    }
  }

  void copy(String text) {
    android.content.ClipboardManager c =
        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
    c.setPrimaryClip(ClipData.newPlainText("厚涂小站", text));
    toast("已复制。");
  }

  void toast(String text) {
    Toast.makeText(this, text, Toast.LENGTH_LONG).show();
  }

  int dp(int n) {
    return Math.round(n * getResources().getDisplayMetrics().density);
  }

  protected void onStart() {
    super.onStart();
    RuntimeHost.visible = true;
    RuntimeHost.transfersCancelled = false;
    startForegroundService(new Intent(this, RuntimeService.class));
  }

  protected void onResume() {
    super.onResume(); updatesForeground = true;
    updatesHandler.removeCallbacks(automaticUpdates); updatesHandler.postDelayed(automaticUpdates, 4000);
  }

  protected void onPause() {
    updatesForeground = false; updatesHandler.removeCallbacks(automaticUpdates); super.onPause();
  }

  protected void onStop() {
    RuntimeHost.visible = false;
    super.onStop();
  }

  void requestTaskNotifications() {
    if (Build.VERSION.SDK_INT < 33
        || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) return;
    android.content.SharedPreferences prefs = getPreferences(MODE_PRIVATE);
    if (prefs.getBoolean("notificationAsked", false)) return;
    prefs.edit().putBoolean("notificationAsked", true).apply();
    new AlertDialog.Builder(this)
        .setTitle("查看后台处理进度")
        .setMessage("允许任务通知后，离开页面也能看到本机修图进度。")
        .setNegativeButton("稍后", null)
        .setPositiveButton(
            "允许通知",
            (d, w) ->
                requestPermissions(
                    new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 5))
        .show();
  }

  public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  protected void onDestroy() {
    updatesHandler.removeCallbacks(automaticUpdates);
    if (documents != null) documents.close();
    if (web != null) web.destroy();
    if (engine != null && engine.getParent() != null)
      ((ViewGroup) engine.getParent()).removeView(engine);
    if (chooser != null) chooser.onReceiveValue(null);
    if (RuntimeHost.activity == this) RuntimeHost.activity = null;
    super.onDestroy();
  }
}
