package com.damerkhata.app;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class StorageManager {

    private static final String TAG = "StorageManager";
    private static final String DATA_FILE = "dokan_data.json";
    private static final String TMP_FILE = "dokan_data.tmp";
    private static final String PREV_DAY_FILE = "dokan_data_yesterday.json";
    private static final String DATE_TRACKER_FILE = "dokan_last_date.txt";

    private final Context context;

    public StorageManager(Context context) {
        this.context = context;
        checkDailyBackup();
    }

    public synchronized String load() {
        File file = new File(context.getFilesDir(), DATA_FILE);
        if (!file.exists()) {
            return "";
        }
        try (FileInputStream fis = new FileInputStream(file);
             InputStreamReader reader = new InputStreamReader(fis, StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            int read;
            while ((read = reader.read(buf)) != -1) {
                sb.append(buf, 0, read);
            }
            return sb.toString();
        } catch (Exception e) {
            Log.e(TAG, "Error loading data file", e);
            // Fallback to yesterday's snapshot if main file is corrupted
            File fallback = new File(context.getFilesDir(), PREV_DAY_FILE);
            if (fallback.exists()) {
                try (FileInputStream fis = new FileInputStream(fallback);
                     InputStreamReader reader = new InputStreamReader(fis, StandardCharsets.UTF_8)) {
                    StringBuilder sb = new StringBuilder();
                    char[] buf = new char[4096];
                    int read;
                    while ((read = reader.read(buf)) != -1) {
                        sb.append(buf, 0, read);
                    }
                    return sb.toString();
                } catch (Exception ex) {
                    Log.e(TAG, "Fallback also failed", ex);
                }
            }
            return "";
        }
    }

    public synchronized boolean save(String json) {
        checkDailyBackup();
        File filesDir = context.getFilesDir();
        File tmp = new File(filesDir, TMP_FILE);
        File dest = new File(filesDir, DATA_FILE);

        try (FileOutputStream fos = new FileOutputStream(tmp);
             OutputStreamWriter writer = new OutputStreamWriter(fos, StandardCharsets.UTF_8)) {
            writer.write(json);
            writer.flush();
            fos.getFD().sync(); // Ensure physical write to storage
        } catch (Exception e) {
            Log.e(TAG, "Error writing temporary data file", e);
            return false;
        }

        // Atomic rename
        if (dest.exists()) {
            dest.delete();
        }
        boolean renamed = tmp.renameTo(dest);
        if (!renamed) {
            Log.e(TAG, "Atomic rename from tmp to destination failed");
            return false;
        }
        return true;
    }

    private void checkDailyBackup() {
        try {
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            File trackerFile = new File(context.getFilesDir(), DATE_TRACKER_FILE);
            String lastDate = "";
            if (trackerFile.exists()) {
                try (FileInputStream fis = new FileInputStream(trackerFile);
                     InputStreamReader isr = new InputStreamReader(fis, StandardCharsets.UTF_8)) {
                    char[] buf = new char[32];
                    int r = isr.read(buf);
                    if (r > 0) lastDate = new String(buf, 0, r).trim();
                }
            }

            if (!today.equals(lastDate)) {
                File currentData = new File(context.getFilesDir(), DATA_FILE);
                if (currentData.exists() && currentData.length() > 0) {
                    File prevBackup = new File(context.getFilesDir(), PREV_DAY_FILE);
                    copyFile(currentData, prevBackup);
                    Log.i(TAG, "Created daily rollback copy for: " + today);
                }
                try (FileOutputStream fos = new FileOutputStream(trackerFile);
                     OutputStreamWriter osw = new OutputStreamWriter(fos, StandardCharsets.UTF_8)) {
                    osw.write(today);
                    osw.flush();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Daily backup check error", e);
        }
    }

    private void copyFile(File src, File dst) {
        try (FileInputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
            out.flush();
        } catch (Exception e) {
            Log.e(TAG, "Copy file error", e);
        }
    }
}
