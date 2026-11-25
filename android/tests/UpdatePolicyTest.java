package cn.houtu.studio;

public final class UpdatePolicyTest {
  static void require(boolean value) { if (!value) throw new AssertionError("Update policy failed"); }
  public static void main(String[] args) {
    long now = 2000000L;
    require(UpdatePolicy.shouldCheck(true, true, 0, now));
    require(!UpdatePolicy.shouldCheck(false, true, 0, now));
    require(UpdatePolicy.shouldCheck(false, false, 0, now));
    require(!UpdatePolicy.shouldCheck(true, true, now - 899999, now));
    require(UpdatePolicy.shouldCheck(true, true, now - 900000, now));
    require(!UpdatePolicy.shouldCheck(true, false, now - 29999, now));
    require(UpdatePolicy.shouldCheck(true, false, now - 30000, now));
    require(UpdatePolicy.shouldCheck(true, true, now + 1, now));
    require(UpdatePolicy.showReminder(true, true, "1.24.0", "1.23.2"));
    require(!UpdatePolicy.showReminder(true, true, "1.24.0", "1.24.0"));
    require(!UpdatePolicy.showReminder(false, true, "1.24.0", ""));
    require(!UpdatePolicy.showReminder(true, false, "1.24.0", ""));
    require(UpdatePolicy.stableTag("v1.24.0"));
    for (String tag : new String[]{"v01.24.0", "v1.24.0-beta", "main", "1.24.0", "v1.24"})
      require(!UpdatePolicy.stableTag(tag));
    System.out.println("PASS native update scheduling, manual override, clock rollback, dismissal and stable tags");
  }
}
