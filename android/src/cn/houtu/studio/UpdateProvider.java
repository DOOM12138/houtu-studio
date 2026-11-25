package cn.houtu.studio;

import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.*;

public final class UpdateProvider extends ContentProvider {
  public boolean onCreate() {
    return true;
  }

  public String getType(Uri u) {
    return "application/vnd.android.package-archive";
  }

  public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
    if (!"/update.apk".equals(u.getPath()) || !"r".equals(mode)) throw new FileNotFoundException();
    return ParcelFileDescriptor.open(
        new File(getContext().getCacheDir(), "update.apk"), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  public Cursor query(Uri u, String[] p, String s, String[] a, String sort) {
    if (!"/update.apk".equals(u.getPath())) return null;
    String[] columns = p == null ? new String[] {"_display_name", "_size"} : p;
    MatrixCursor result = new MatrixCursor(columns);
    Object[] row = new Object[columns.length];
    File file = new File(getContext().getCacheDir(), "update.apk");
    for (int i = 0; i < columns.length; i++) {
      if ("_display_name".equals(columns[i])) row[i] = "厚涂小站更新.apk";
      else if ("_size".equals(columns[i])) row[i] = file.length();
    }
    result.addRow(row);
    return result;
  }

  public Uri insert(Uri u, ContentValues v) {
    throw new UnsupportedOperationException();
  }

  public int delete(Uri u, String s, String[] a) {
    throw new UnsupportedOperationException();
  }

  public int update(Uri u, ContentValues v, String s, String[] a) {
    throw new UnsupportedOperationException();
  }
}
