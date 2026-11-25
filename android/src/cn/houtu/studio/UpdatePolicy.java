package cn.houtu.studio;

// Kept independent of Android so the real scheduling rules can be verified during the APK build.
final class UpdatePolicy {
  static final long AUTO_INTERVAL_MS = 15L * 60 * 1000;
  static final long MANUAL_INTERVAL_MS = 30L * 1000;

  static boolean shouldCheck(boolean enabled, boolean automatic, long lastAttempt, long now) {
    if (automatic && !enabled) return false;
    if (lastAttempt <= 0 || now < lastAttempt) return true;
    return now - lastAttempt >= (automatic ? AUTO_INTERVAL_MS : MANUAL_INTERVAL_MS);
  }

  static boolean showReminder(boolean enabled, boolean available, String version, String dismissed) {
    return enabled && available && version != null && !version.equals(dismissed);
  }

  static boolean stableTag(String tag) {
    return tag != null && tag.matches("v(?:0|[1-9][0-9]{0,4})\\.(?:0|[1-9][0-9]{0,4})\\.(?:0|[1-9][0-9]{0,4})");
  }
}
