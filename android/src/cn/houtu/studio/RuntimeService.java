package cn.houtu.studio;

import android.app.*;
import android.content.*;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.io.File;
import org.json.JSONObject;

public final class RuntimeService extends Service {
  public void onCreate() {
    super.onCreate();
    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    manager.createNotificationChannel(
        new NotificationChannel("processing", "本机图片处理", NotificationManager.IMPORTANCE_LOW));
    PendingIntent open =
        PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
    startForeground(
        21,
        new Notification.Builder(this, "processing")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentTitle("厚涂小站")
            .setContentText("本机工作台运行中，图片保存在手机。")
            .setContentIntent(open)
            .setOngoing(true)
            .build(),
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            | (android.os.Build.VERSION.SDK_INT >= 35
                ? android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING
                : 0));
    RuntimeHost.start(this);
  }

  final Handler handler = new Handler(Looper.getMainLooper());
  long idleSince;
  final Runnable check =
      new Runnable() {
        public void run() {
          boolean busy = true;
          try {
            File file = new File(RuntimeHost.root, "runtime-status.json");
            if (file.isFile()) busy = new JSONObject(RuntimeHost.read(file)).optBoolean("busy");
          } catch (Exception ignored) {
          }
          busy = busy || RuntimeHost.nativeOperations.get() > 0;
          if (!RuntimeHost.visible && !busy) {
            if (idleSince == 0) idleSince = System.currentTimeMillis();
            if (System.currentTimeMillis() - idleSince > 30000) {
              stopForeground(STOP_FOREGROUND_REMOVE);
              stopSelf();
              return;
            }
          } else idleSince = 0;
          handler.postDelayed(this, 5000);
        }
      };

  public int onStartCommand(Intent i, int flags, int id) {
    handler.removeCallbacks(check);
    handler.postDelayed(check, 5000);
    return START_NOT_STICKY;
  }

  public IBinder onBind(Intent i) {
    return null;
  }

  public void onDestroy() {
    handler.removeCallbacks(check);
    super.onDestroy();
  }

  public void onTimeout(int startId, int type) {
    RuntimeHost.stopWork();
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }
}
