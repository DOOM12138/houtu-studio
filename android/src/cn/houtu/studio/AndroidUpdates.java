package cn.houtu.studio;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

final class AndroidUpdates {
  static final String API =
      "https://api.github.com/repos/DOOM12138/houtu-studio/releases?per_page=10";
  static final AtomicBoolean running = new AtomicBoolean(false);
  static volatile boolean pendingInstall;

  static SharedPreferences preferences(MainActivity activity) {
    return activity.getSharedPreferences("houtu-updates", android.content.Context.MODE_PRIVATE);
  }

  static boolean enabled(MainActivity activity) { return preferences(activity).getBoolean("autoCheck", true); }

  static String installed(MainActivity activity) throws Exception {
    return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
  }

  static JSONObject cachedOffer(MainActivity activity) {
    try {
      JSONObject offer = new JSONObject(preferences(activity).getString("offer", "{}"));
      String version = offer.optString("version"), abi = Build.SUPPORTED_ABIS[0];
      String expected = "https://github.com/DOOM12138/houtu-studio/releases/download/v" + version
          + "/houtu-studio-" + version + "-Android-" + abi + ".apk";
      if (!UpdatePolicy.stableTag("v" + version) || !expected.equals(offer.optString("url"))
          || !offer.optString("sha").matches("[a-fA-F0-9]{64}")
          || offer.optLong("size") < 10000 || offer.optLong("size") > 1024L * 1024 * 1024)
        return null;
      return compare(version, installed(activity)) > 0 ? offer : null;
    } catch (Exception e) { return null; }
  }

  static JSONObject status(MainActivity activity) {
    JSONObject out = new JSONObject();
    try {
      SharedPreferences prefs = preferences(activity);
      JSONObject offer = cachedOffer(activity);
      String version = offer == null ? "" : offer.optString("version");
      out.put("platform", "android").put("currentVersion", installed(activity))
          .put("settings", new JSONObject().put("autoCheck", enabled(activity)))
          .put("checkIntervalMinutes", 15).put("lastChecked", prefs.getLong("lastChecked", 0))
          .put("checkError", prefs.getString("checkError", ""))
          .put("dismissedVersion", prefs.getString("dismissedVersion", ""))
          .put("available", UpdatePolicy.showReminder(enabled(activity), offer != null, version,
              prefs.getString("dismissedVersion", "")))
          .put("latest", offer == null ? JSONObject.NULL : new JSONObject()
              .put("version", version).put("notes", offer.optString("notes")));
    } catch (Exception e) { }
    return out;
  }

  static void publish(MainActivity activity) {
    activity.runOnUiThread(() -> {
      if (!activity.isFinishing() && !activity.isDestroyed() && activity.web != null && activity.own(activity.web.getUrl()))
        activity.web.evaluateJavascript("window.dispatchEvent(new CustomEvent('houtu:update-status',{detail:"
            + status(activity).toString() + "}));", null);
    });
  }

  static void configure(MainActivity activity, boolean value) {
    preferences(activity).edit().putBoolean("autoCheck", value).apply();
    publish(activity);
    activity.toast(value ? "已开启自动检查GitHub更新。" : "已关闭自动检查，可从菜单手动检查。");
    if (value) check(activity, true);
  }

  static void dismiss(MainActivity activity, String version) {
    JSONObject offer = cachedOffer(activity);
    if (offer != null && offer.optString("version").equals(version))
      preferences(activity).edit().putString("dismissedVersion", version).apply();
    publish(activity);
  }

  static void details(MainActivity activity) {
    JSONObject offer = cachedOffer(activity);
    if (offer == null) check(activity); else showDetails(activity, offer);
  }

  static void showDetails(MainActivity activity, JSONObject offer) {
    if (activity.isFinishing() || activity.isDestroyed() || !activity.updatesForeground) return;
    String version = offer.optString("version");
    String description = version + " · " + Math.round(offer.optLong("size") / 1024.0 / 1024.0)
        + " MB\n\n" + offer.optString("notes")
        + "\n\n完整更新同步全部功能与资源。下载后核对SHA-256、应用签名和版本，由系统确认安装；手机照片和账号资料保留。";
    new AlertDialog.Builder(activity).setTitle("有新版安卓版").setMessage(description)
        .setNegativeButton("稍后", (d, w) -> dismiss(activity, version))
        .setPositiveButton("下载并安装", (d, w) -> download(activity, offer.optString("url"),
            offer.optString("sha"), offer.optLong("size"))).show();
  }

  static void check(MainActivity activity) { check(activity, false); }

  static void check(MainActivity activity, boolean automatic) {
    if (automatic && (!enabled(activity) || !activity.updatesForeground)) return;
    if (running.get()) { if (!automatic) activity.toast("正在处理更新。"); return; }
    SharedPreferences prefs = preferences(activity);
    long now = System.currentTimeMillis();
    if (!UpdatePolicy.shouldCheck(enabled(activity), automatic, prefs.getLong("lastAttempt", 0), now)) {
      publish(activity);
      if (!automatic) { JSONObject offer = cachedOffer(activity); if (offer != null) showDetails(activity, offer);
        else activity.toast("刚检查过版本，请稍后再试。"); }
      return;
    }
    if (!running.compareAndSet(false, true)) return;
    prefs.edit().putLong("lastAttempt", now).putBoolean("autoCheck", enabled(activity)).apply();
    if (!automatic) activity.toast("正在检查安卓版更新…");
    new Thread(() -> {
      try {
        String current = installed(activity), abi = Build.SUPPORTED_ABIS[0];
        JSONArray releases = new JSONArray(new String(bytes(API, 4 * 1024 * 1024), StandardCharsets.UTF_8));
        JSONObject selected = null, asset = null;
        for (int i = 0; i < releases.length(); i++) {
          JSONObject release = releases.getJSONObject(i);
          String tag = release.optString("tag_name");
          if (release.optBoolean("draft") || release.optBoolean("prerelease") || !UpdatePolicy.stableTag(tag)) continue;
          JSONArray assets = release.optJSONArray("assets"); if (assets == null) continue;
          String name = "houtu-studio-" + tag.substring(1) + "-Android-" + abi + ".apk";
          for (int j = 0; j < assets.length(); j++) {
            JSONObject candidate = assets.getJSONObject(j);
            if (candidate.optString("name").equals(name) && candidate.optString("state").equals("uploaded")
                && (selected == null || compare(tag, selected.optString("tag_name")) > 0)) {
              selected = release; asset = candidate;
            }
          }
        }
        JSONObject offer = null;
        if (selected != null && compare(selected.optString("tag_name"), current) > 0) {
          String version = selected.getString("tag_name").substring(1), digest = asset.optString("digest");
          long size = asset.getLong("size");
          String expected = "https://github.com/DOOM12138/houtu-studio/releases/download/v" + version
              + "/houtu-studio-" + version + "-Android-" + abi + ".apk";
          if (!digest.matches("sha256:[0-9a-fA-F]{64}") || size < 10000 || size > 1024L * 1024 * 1024
              || !expected.equals(asset.optString("browser_download_url")))
            throw new IOException("更新包来源或校验信息不完整，请稍后重试。");
          String notes = selected.optString("body", ""); if (notes.length() > 1800) notes = notes.substring(0, 1800);
          offer = new JSONObject().put("version", version).put("url", expected).put("size", size)
              .put("sha", digest.substring(7)).put("notes", notes);
        }
        SharedPreferences.Editor edit = prefs.edit().putLong("lastChecked", System.currentTimeMillis()).remove("checkError");
        if (offer == null) edit.remove("offer"); else edit.putString("offer", offer.toString());
        edit.apply();
        final JSONObject found = offer;
        activity.runOnUiThread(() -> {
          publish(activity);
          if (!automatic && activity.updatesForeground) {
            if (found != null) showDetails(activity, found); else activity.toast("当前安卓版已是最新可用版本。");
          }
        });
      } catch (Exception e) {
        prefs.edit().putString("checkError", e.getMessage()).apply();
        activity.runOnUiThread(() -> { publish(activity); if (!automatic) activity.toast("检查更新未完成：" + e.getMessage()); });
      } finally { running.set(false); }
    }, "HoutuUpdateCheck").start();
  }

  static int compare(String a, String b) {
    int[] x = version(a), y = version(b);
    for (int i = 0; i < 3; i++) if (x[i] != y[i]) return Integer.compare(x[i], y[i]);
    return 0;
  }

  static int[] version(String value) {
    java.util.regex.Matcher m =
        java.util.regex.Pattern.compile(
                "(?:^|v)([0-9]{1,5})\\.([0-9]{1,5})\\.([0-9]{1,5})(?:$|[-+])")
            .matcher(value == null ? "" : value);
    if (!m.find()) return new int[] {0, 0, 0};
    return new int[] {
      Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3))
    };
  }

  static HttpURLConnection connection(String address) throws IOException {
    URL url = new URL(address);
    for (int i = 0; i < 6; i++) {
      String host = url.getHost().toLowerCase(Locale.ROOT);
      if (!url.getProtocol().equals("https")
          || url.getUserInfo() != null
          || url.getPort() != -1 && url.getPort() != 443
          || !(host.equals("github.com")
              || host.equals("api.github.com")
              || host.endsWith(".githubusercontent.com")))
        throw new IOException("更新地址不在项目 GitHub 来源。");
      HttpURLConnection c = (HttpURLConnection) url.openConnection();
      c.setInstanceFollowRedirects(false);
      c.setConnectTimeout(20000);
      c.setReadTimeout(45000);
      c.setRequestProperty("User-Agent", "HoutuStudio-Android");
      c.setRequestProperty("Accept", "application/vnd.github+json");
      int status = c.getResponseCode();
      if (status >= 300 && status < 400) {
        String to = c.getHeaderField("Location");
        c.disconnect();
        if (to == null) throw new IOException("更新重定向无效。");
        url = new URL(url, to);
        continue;
      }
      if (status != 200) {
        c.disconnect();
        throw new IOException(status == 403 ? "GitHub 暂时限制请求，请稍后再试。" : "GitHub 返回 " + status);
      }
      return c;
    }
    throw new IOException("更新重定向过多。");
  }

  static byte[] bytes(String url, int max) throws IOException {
    HttpURLConnection c = connection(url);
    try (InputStream in = c.getInputStream()) {
      return RuntimeHost.readAll(in, max);
    } finally {
      c.disconnect();
    }
  }

  static void download(MainActivity activity, String address, String expected, long size) {
    if (!running.compareAndSet(false, true)) return;
    AtomicBoolean cancelled = new AtomicBoolean();
    ProgressDialog progress = new ProgressDialog(activity);
    progress.setTitle("下载安卓版");
    progress.setMessage("核对后交由系统安装，资料保留。");
    progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
    progress.setMax(100);
    progress.setCancelable(true);
    progress.setOnCancelListener(d -> cancelled.set(true));
    progress.show();
    RuntimeHost.nativeOperations.incrementAndGet();
    new Thread(
            () -> {
              File partial = new File(activity.getCacheDir(), "update.apk.part"),
                  apk = new File(activity.getCacheDir(), "update.apk");
              try {
                HttpURLConnection c = connection(address);
                try (InputStream in = c.getInputStream();
                    OutputStream out = new FileOutputStream(partial)) {
                  byte[] buffer = new byte[65536];
                  MessageDigest hash = MessageDigest.getInstance("SHA-256");
                  long count = 0, last = 0;
                  int n;
                  while ((n = in.read(buffer)) != -1) {
                    if (cancelled.get()) throw new IOException("已取消下载。");
                    count += n;
                    if (count > size || count > 1024L * 1024 * 1024)
                      throw new IOException("安装包大小异常。");
                    hash.update(buffer, 0, n);
                    out.write(buffer, 0, n);
                    if (System.currentTimeMillis() - last > 350) {
                      last = System.currentTimeMillis();
                      int percent = (int) (100 * count / size);
                      activity.runOnUiThread(() -> progress.setProgress(percent));
                    }
                  }
                  if (count != size || !hex(hash.digest()).equalsIgnoreCase(expected))
                    throw new IOException("安装包 SHA-256 校验未通过。");
                } finally {
                  c.disconnect();
                }
                verify(activity, partial);
                Files.move(partial.toPath(), apk.toPath(), StandardCopyOption.REPLACE_EXISTING);
                activity.runOnUiThread(
                    () -> {
                      progress.dismiss();
                      install(activity);
                    });
              } catch (Exception e) {
                partial.delete();
                activity.runOnUiThread(
                    () -> {
                      progress.dismiss();
                      activity.toast("更新未安装：" + e.getMessage());
                    });
              } finally {
                running.set(false);
                RuntimeHost.nativeOperations.decrementAndGet();
              }
            },
            "HoutuUpdateDownload")
        .start();
  }

  static void verify(MainActivity a, File file) throws Exception {
    PackageManager pm = a.getPackageManager();
    PackageInfo
        installed = pm.getPackageInfo(a.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES),
        candidate =
            pm.getPackageArchiveInfo(
                file.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
    if (candidate == null
        || !a.getPackageName().equals(candidate.packageName)
        || candidate.getLongVersionCode() <= installed.getLongVersionCode())
      throw new IOException("安装包的应用或版本不匹配。");
    if (!signers(installed).equals(signers(candidate))) throw new IOException("安装包签名与当前应用不同。");
  }

  static Set<String> signers(PackageInfo p) throws Exception {
    if (p.signingInfo == null) throw new IOException("无法读取安装签名。");
    Set<String> out = new HashSet<>();
    for (android.content.pm.Signature s : p.signingInfo.getApkContentsSigners())
      out.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
    if (out.isEmpty()) throw new IOException("安装包缺少签名。");
    return out;
  }

  static String hex(byte[] bytes) {
    StringBuilder out = new StringBuilder();
    for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255));
    return out.toString();
  }

  static void install(MainActivity activity) {
    try {
      File apk = new File(activity.getCacheDir(), "update.apk");
      verify(activity, apk);
      if (!activity.getPackageManager().canRequestPackageInstalls()) {
        pendingInstall = true;
        new AlertDialog.Builder(activity)
            .setTitle("允许安装应用更新")
            .setMessage("在系统页面允许厚涂小站安装更新，返回后继续由系统确认。")
            .setNegativeButton("稍后", (d, w) -> pendingInstall = false)
            .setPositiveButton(
                "打开系统设置",
                (d, w) ->
                    activity.startActivityForResult(
                        new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())),
                        4))
            .show();
        return;
      }
      pendingInstall = false;
      Uri uri = Uri.parse("content://cn.houtu.studio.updates/update.apk");
      activity.startActivity(
          new Intent(Intent.ACTION_VIEW)
              .setDataAndType(uri, "application/vnd.android.package-archive")
              .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
    } catch (Exception e) {
      activity.toast("无法开始安装：" + e.getMessage());
    }
  }

  static void resumed(MainActivity activity) {
    if (pendingInstall && activity.getPackageManager().canRequestPackageInstalls())
      install(activity);
  }
}
