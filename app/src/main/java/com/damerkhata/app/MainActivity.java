package com.damerkhata.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    private static final int REQ_CAMERA = 1001;
    private static final int REQ_GALLERY = 1002;
    private static final int REQ_BACKUP_PICK = 1003;

    private WebView webView;
    private StorageManager storageManager;
    private UpdateManager updateManager;
    private BiometricHelper biometricHelper;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable watchdogRunnable;
    private boolean isPageReady = false;
    private long backgroundStartTime = 0;

    private String pendingPhotoSlot = "single";
    private Uri cameraCaptureUri;
    private File cameraCaptureFile;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        storageManager = new StorageManager(this);
        updateManager = new UpdateManager(this, getCurrentVersion());
        biometricHelper = new BiometricHelper(this);

        setupWebView();
        loadAppUrl();

        // Background update check on app launch
        updateManager.checkForUpdate(false, new UpdateManager.UpdateCallback() {
            @Override
            public void onUpdateAvailable(String version) {
                sendJsCallback("if(window.onUpdateReady) window.onUpdateReady();");
            }

            @Override
            public void onNoUpdate(String currentVersion) {}

            @Override
            public void onError(String message) {}
        });
    }

    private void setupWebView() {
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new WebAppInterface(this), "Android");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d("WebViewConsole", cm.message() + " -- From line " + cm.lineNumber() + " of " + cm.sourceId());
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + description + " URL: " + failingUrl);
                // Fallback to internal bundled version
                if (!failingUrl.startsWith("file:///android_asset/")) {
                    webView.loadUrl("file:///android_asset/app.html");
                }
            }
        });
    }

    public void loadAppUrl() {
        isPageReady = false;
        File downloaded = new File(getFilesDir(), UpdateManager.LATEST_HTML_FILE);
        if (downloaded.exists() && downloaded.length() > 5000) {
            // Start 12-second watchdog
            startWatchdog();
            webView.loadUrl("file://" + downloaded.getAbsolutePath());
        } else {
            webView.loadUrl("file:///android_asset/app.html");
        }
    }

    private void startWatchdog() {
        if (watchdogRunnable != null) {
            handler.removeCallbacks(watchdogRunnable);
        }
        watchdogRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isPageReady) {
                    Log.w(TAG, "Watchdog: ready() not received within 12s! Rolling back to asset version.");
                    File downloaded = new File(getFilesDir(), UpdateManager.LATEST_HTML_FILE);
                    if (downloaded.exists()) {
                        downloaded.delete();
                    }
                    webView.loadUrl("file:///android_asset/app.html");
                }
            }
        };
        handler.postDelayed(watchdogRunnable, 12000);
    }

    public void onPageReady() {
        isPageReady = true;
        if (watchdogRunnable != null) {
            handler.removeCallbacks(watchdogRunnable);
        }
    }

    public void sendJsCallback(final String script) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.evaluateJavascript(script, null);
                }
            }
        });
    }

    public String getCurrentVersion() {
        return "1.0.0";
    }

    public StorageManager getStorageManager() { return storageManager; }
    public UpdateManager getUpdateManager() { return updateManager; }
    public BiometricHelper getBiometricHelper() { return biometricHelper; }

    // --- PHOTO PICKER (CAMERA OR GALLERY) ---
    public void openPhotoPicker(String slot) {
        this.pendingPhotoSlot = slot;
        String[] options = {"📷 ক্যামেরা দিয়ে ছবি তুলুন", "🖼️ গ্যালারি থেকে ছবি বাছুন"};
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("ছবি যোগ করুন");
        builder.setItems(options, new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                if (which == 0) {
                    launchCamera();
                } else {
                    launchGallery();
                }
            }
        });
        builder.show();
    }

    private void launchCamera() {
        try {
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (dir != null && !dir.exists()) dir.mkdirs();
            cameraCaptureFile = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");

            cameraCaptureUri = Uri.parse("content://" + AppFileProvider.AUTHORITY + "/camera_photos/" + cameraCaptureFile.getName());
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraCaptureUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQ_CAMERA);
        } catch (Exception e) {
            Log.e(TAG, "Camera launch failed", e);
            launchGallery();
        }
    }

    private void launchGallery() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        startActivityForResult(Intent.createChooser(intent, "ছবি বাছুন"), REQ_GALLERY);
    }

    public void openBackupPicker() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        startActivityForResult(Intent.createChooser(intent, "ব্যাকআপ ফাইল বাছুন"), REQ_BACKUP_PICK);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (resultCode != RESULT_OK) return;

        if (requestCode == REQ_CAMERA) {
            processAndSendPhoto(cameraCaptureFile != null && cameraCaptureFile.exists() ? Uri.fromFile(cameraCaptureFile) : cameraCaptureUri);
        } else if (requestCode == REQ_GALLERY && data != null && data.getData() != null) {
            processAndSendPhoto(data.getData());
        } else if (requestCode == REQ_BACKUP_PICK && data != null && data.getData() != null) {
            readAndSendBackup(data.getData());
        }
    }

    private void processAndSendPhoto(final Uri imageUri) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    InputStream is = getContentResolver().openInputStream(imageUri);
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inJustDecodeBounds = true;
                    BitmapFactory.decodeStream(is, null, opts);
                    if (is != null) is.close();

                    int maxDim = 360;
                    int scale = 1;
                    while (opts.outWidth / scale > maxDim * 2 || opts.outHeight / scale > maxDim * 2) {
                        scale *= 2;
                    }

                    opts.inJustDecodeBounds = false;
                    opts.inSampleSize = scale;

                    is = getContentResolver().openInputStream(imageUri);
                    Bitmap bitmap = BitmapFactory.decodeStream(is, null, opts);
                    if (is != null) is.close();

                    if (bitmap == null) return;

                    // Fix EXIF orientation
                    int orientation = ExifInterface.ORIENTATION_NORMAL;
                    try {
                        InputStream exifStream = getContentResolver().openInputStream(imageUri);
                        if (exifStream != null) {
                            ExifInterface exif = new ExifInterface(exifStream);
                            orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                            exifStream.close();
                        }
                    } catch (Exception ex) {
                        Log.w(TAG, "EXIF read error", ex);
                    }

                    Matrix matrix = new Matrix();
                    if (orientation == ExifInterface.ORIENTATION_ROTATE_90) matrix.postRotate(90);
                    else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) matrix.postRotate(180);
                    else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) matrix.postRotate(270);

                    // Final scale to max 360px
                    int w = bitmap.getWidth();
                    int h = bitmap.getHeight();
                    float ratio = Math.min((float) maxDim / w, (float) maxDim / h);
                    if (ratio < 1.0f) {
                        matrix.postScale(ratio, ratio);
                    }

                    Bitmap finalBmp = Bitmap.createBitmap(bitmap, 0, 0, w, h, matrix, true);
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    finalBmp.compress(Bitmap.CompressFormat.JPEG, 80, baos);
                    byte[] bytes = baos.toByteArray();
                    String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    final String dataUrl = "data:image/jpeg;base64," + b64;

                    // Clean up camera tmp file
                    if (cameraCaptureFile != null && cameraCaptureFile.exists()) {
                        cameraCaptureFile.delete();
                    }

                    sendJsCallback("if(window.onPhoto) window.onPhoto('" + pendingPhotoSlot + "', '" + dataUrl + "');");
                } catch (Exception e) {
                    Log.e(TAG, "Photo processing failed", e);
                }
            }
        }).start();
    }

    private void readAndSendBackup(final Uri uri) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try (InputStream is = getContentResolver().openInputStream(uri);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    StringBuilder sb = new StringBuilder();
                    char[] buf = new char[4096];
                    int r;
                    while ((r = isr.read(buf)) != -1) {
                        sb.append(buf, 0, r);
                    }
                    final String json = sb.toString();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            webView.evaluateJavascript("if(window.onBackup) window.onBackup(" + JSONObjectEscape(json) + ");", null);
                        }
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Read backup failed", e);
                }
            }
        }).start();
    }

    private String JSONObjectEscape(String s) {
        StringBuilder sb = new StringBuilder();
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < ' ') {
                        String t = "000" + Integer.toHexString(c);
                        sb.append("\\u").append(t.substring(t.length() - 4));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }

    // --- MEDIASTORE / SAF BACKUP & SHARE ---
    public void performBackup(final String filename, final String json) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String savedPath = "";
                Uri contentUri = null;

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Dokan/");

                        ContentResolver resolver = getContentResolver();
                        contentUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (contentUri != null) {
                            try (OutputStream os = resolver.openOutputStream(contentUri);
                                 OutputStreamWriter writer = new OutputStreamWriter(os, StandardCharsets.UTF_8)) {
                                writer.write(json);
                                writer.flush();
                            }
                            savedPath = "Download/Dokan/" + filename;
                        }
                    } else {
                        File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        File dokanDir = new File(downloadDir, "Dokan");
                        if (!dokanDir.exists()) dokanDir.mkdirs();
                        File dest = new File(dokanDir, filename);
                        try (FileOutputStream fos = new FileOutputStream(dest);
                             OutputStreamWriter writer = new OutputStreamWriter(fos, StandardCharsets.UTF_8)) {
                            writer.write(json);
                            writer.flush();
                        }
                        savedPath = dest.getAbsolutePath();
                        contentUri = Uri.parse("content://" + AppFileProvider.AUTHORITY + "/internal_files/" + filename);
                    }

                    final String finalPath = savedPath;
                    final Uri finalUri = contentUri;

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            sendJsCallback("if(window.onBackupSaved) window.onBackupSaved('" + finalPath + "');");

                            // Open Share Sheet for WhatsApp / Drive / Email
                            if (finalUri != null) {
                                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                                shareIntent.setType("application/json");
                                shareIntent.putExtra(Intent.EXTRA_STREAM, finalUri);
                                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(Intent.createChooser(shareIntent, "দামের খাতা - ব্যাকআপ ফাইল শেয়ার করুন"));
                            }
                        }
                    });

                } catch (Exception e) {
                    Log.e(TAG, "Backup failed", e);
                }
            }
        }).start();
    }

    // --- HARDWARE BACK BUTTON ---
    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("if(window.onBackPressed){window.onBackPressed();}else{false;}", new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (!"true".equalsIgnoreCase(value)) {
                        MainActivity.super.onBackPressed();
                    }
                }
            });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        backgroundStartTime = System.currentTimeMillis();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (backgroundStartTime > 0) {
            long elapsed = (System.currentTimeMillis() - backgroundStartTime) / 1000;
            sendJsCallback("if(window.onAppResume) window.onAppResume(" + elapsed + ");");
            backgroundStartTime = 0;
        }
    }

    @Override
    protected void onDestroy() {
        if (biometricHelper != null) {
            biometricHelper.cancel();
        }
        super.onDestroy();
    }
}
