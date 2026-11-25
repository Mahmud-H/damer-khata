package com.damerkhata.app;

import android.webkit.JavascriptInterface;

public class WebAppInterface {

    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String load() {
        return activity.getStorageManager().load();
    }

    @JavascriptInterface
    public void save(String json) {
        activity.getStorageManager().save(json);
    }

    @JavascriptInterface
    public void ready() {
        activity.onPageReady();
    }

    @JavascriptInterface
    public void reload() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.loadAppUrl();
            }
        });
    }

    @JavascriptInterface
    public String version() {
        return activity.getCurrentVersion();
    }

    @JavascriptInterface
    public void pickPhoto(final String slot) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.openPhotoPicker(slot);
            }
        });
    }

    @JavascriptInterface
    public void pickBackup() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.openBackupPicker();
            }
        });
    }

    @JavascriptInterface
    public void backup(final String name, final String json) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.performBackup(name, json);
            }
        });
    }

    @JavascriptInterface
    public void checkUpdate() {
        activity.getUpdateManager().checkForUpdate(true, new UpdateManager.UpdateCallback() {
            @Override
            public void onUpdateAvailable(final String version) {
                activity.sendJsCallback("window.onUpdateCheck(true, '" + version + "');");
            }

            @Override
            public void onNoUpdate(final String currentVersion) {
                activity.sendJsCallback("window.onUpdateCheck(false, '" + currentVersion + "');");
            }

            @Override
            public void onError(final String message) {
                activity.sendJsCallback("window.onUpdateCheck(false, '" + activity.getCurrentVersion() + "');");
            }
        });
    }

    @JavascriptInterface
    public boolean canBio() {
        return activity.getBiometricHelper().canAuthenticate();
    }

    @JavascriptInterface
    public void bio() {
        activity.getBiometricHelper().authenticate(new BiometricHelper.AuthCallback() {
            @Override
            public void onSuccess() {
                activity.sendJsCallback("window.onBio(true);");
            }

            @Override
            public void onFailure(String reason) {
                activity.sendJsCallback("window.onBio(false);");
            }
        });
    }
}
