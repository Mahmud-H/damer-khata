package com.damerkhata.app;

import android.app.Activity;
import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UpdateManager {

    private static final String TAG = "UpdateManager";
    public static final String LATEST_HTML_FILE = "app_latest.html";
    private static final String TMP_HTML_FILE = "app_update.tmp";

    // Default GitHub raw URL (can be customized via settings)
    private static final String DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/Mahmud-H/damer-khata/main/app.html";

    private final Activity activity;
    private final String currentVersion;

    public UpdateManager(Activity activity, String currentVersion) {
        this.activity = activity;
        this.currentVersion = currentVersion;
    }

    public void checkForUpdate(final boolean isManual, final UpdateCallback callback) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(DEFAULT_UPDATE_URL);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", "DamerKhata-Android");

                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_OK) {
                        File filesDir = activity.getFilesDir();
                        File tmpFile = new File(filesDir, TMP_HTML_FILE);
                        File targetFile = new File(filesDir, LATEST_HTML_FILE);

                        InputStream is = conn.getInputStream();
                        FileOutputStream fos = new FileOutputStream(tmpFile);
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        StringBuilder preview = new StringBuilder();

                        while ((bytesRead = is.read(buffer)) != -1) {
                            fos.write(buffer, 0, bytesRead);
                            if (preview.length() < 2000) {
                                preview.append(new String(buffer, 0, bytesRead, StandardCharsets.UTF_8));
                            }
                        }
                        fos.flush();
                        fos.close();
                        is.close();

                        // Check version from meta tag
                        String newVersion = extractVersion(preview.toString());
                        boolean isNewer = isVersionNewer(newVersion, currentVersion);

                        if (isNewer || (tmpFile.length() > 10000 && !targetFile.exists())) {
                            if (targetFile.exists()) targetFile.delete();
                            tmpFile.renameTo(targetFile);

                            activity.runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (callback != null) callback.onUpdateAvailable(newVersion);
                                }
                            });
                        } else {
                            tmpFile.delete();
                            activity.runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (callback != null) callback.onNoUpdate(currentVersion);
                                }
                            });
                        }
                    } else {
                        activity.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (callback != null) callback.onError("HTTP " + code);
                            }
                        });
                    }
                } catch (final Exception e) {
                    Log.e(TAG, "Update check failed", e);
                    activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (callback != null) callback.onError(e.getMessage());
                        }
                    });
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    private String extractVersion(String html) {
        Pattern pattern = Pattern.compile("<meta\\s+name=[\"']app-version[\"']\\s+content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(html);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "1.0.0";
    }

    private boolean isVersionNewer(String newVer, String oldVer) {
        if (newVer == null || oldVer == null) return false;
        String[] nParts = newVer.split("\\.");
        String[] oParts = oldVer.split("\\.");
        int len = Math.max(nParts.length, oParts.length);
        for (int i = 0; i < len; i++) {
            int n = i < nParts.length ? Integer.parseInt(nParts[i].replaceAll("[^0-9]", "0")) : 0;
            int o = i < oParts.length ? Integer.parseInt(oParts[i].replaceAll("[^0-9]", "0")) : 0;
            if (n > o) return true;
            if (n < o) return false;
        }
        return false;
    }

    public interface UpdateCallback {
        void onUpdateAvailable(String version);
        void onNoUpdate(String currentVersion);
        void onError(String message);
    }
}
