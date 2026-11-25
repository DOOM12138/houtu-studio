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

  static void check(MainActivity activity) {
    if (!running.compareAndSet(false, true)) {
      activity.toast("正在处理更新。");
      return;
    }
    activity.toast("正在检查安卓版更新…");
    new Thread(
            () -> {
              try {
                String
                    installed =
                        activity
                            .getPackageManager()
                            .getPackageInfo(activity.getPackageName(), 0)
                            .versionName,
                    abi = Build.SUPPORTED_ABIS[0];
                JSONArray releases =
                    new JSONArray(new String(bytes(API, 4 * 1024 * 1024), StandardCharsets.UTF_8));
                JSONObject selected = null, asset = null;
                for (int i = 0; i < releases.length(); i++) {
                  JSONObject release = releases.getJSONObject(i);
                  if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue;
                  JSONArray assets = release.optJSONArray("assets");
                  if (assets == null) continue;
                  for (int j = 0; j < assets.length(); j++) {
                    JSONObject candidate = assets.getJSONObject(j);
                    if (candidate.optString("name").endsWith("-Android-" + abi + ".apk")
                        && (selected == null
                            || compare(
                                    release.optString("tag_name"), selected.optString("tag_name"))
                                > 0)) {
                      selected = release;
                      asset = candidate;
                    }
                  }
                }
                if (selected == null || compare(selected.optString("tag_name"), installed) <= 0) {
                  activity.runOnUiThread(() -> activity.toast("当前安卓版已是最新可用版本。"));
                  return;
                }
                String version = selected.getString("tag_name"),
                    url = asset.getString("browser_download_url"),
                    digest = asset.optString("digest");
                long size = asset.getLong("size");
                if (!digest.matches("sha256:[0-9a-fA-F]{64}")
                    || size < 10000
                    || size > 1024L * 1024 * 1024) throw new IOException("更新包校验信息不完整，请稍后重试。");
                final String sha = digest.substring(7);
                String notes = selected.optString("body", "");
                if (notes.length() > 1200) notes = notes.substring(0, 1200);
                String description =
                    version
                        + " · "
                        + Math.round(size / 1024.0 / 1024.0)
                        + " MB\n\n"
                        + notes
                        + "\n\n下载后核对文件、应用签名与版本，由系统确认安装；手机照片和账号资料保留。";
                activity.runOnUiThread(
                    () -> {
                      if (!activity.isFinishing())
                        new AlertDialog.Builder(activity)
                            .setTitle("有新版安卓版")
                            .setMessage(description)
                            .setNegativeButton("稍后", null)
                            .setPositiveButton(
                                "下载并安装", (d, w) -> download(activity, url, sha, size))
                            .show();
                    });
              } catch (Exception e) {
                activity.runOnUiThread(() -> activity.toast("检查更新未完成：" + e.getMessage()));
              } finally {
                running.set(false);
              }
            },
            "HoutuUpdateCheck")
        .start();
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
