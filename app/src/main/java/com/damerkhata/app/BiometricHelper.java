package com.damerkhata.app;

import android.app.Activity;
import android.content.Context;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;

public class BiometricHelper implements DialogInterface.OnClickListener {

    public interface AuthCallback {
        void onSuccess();
        void onFailure(String reason);
    }

    private final Activity activity;
    private CancellationSignal cancellationSignal;
    private AuthCallback currentCallback;

    public BiometricHelper(Activity activity) {
        this.activity = activity;
    }

    public boolean canAuthenticate() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager pm = activity.getPackageManager();
            return pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            FingerprintManager fm = (FingerprintManager) activity.getSystemService(Context.FINGERPRINT_SERVICE);
            return fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints();
        }
        return false;
    }

    public void authenticate(AuthCallback callback) {
        this.currentCallback = callback;
        if (!canAuthenticate()) {
            if (currentCallback != null) {
                currentCallback.onFailure("ডিভাইসে আঙুলের ছাপ সেন্সর পাওয়া যায়নি বা এনরোল করা নেই।");
            }
            return;
        }

        cancellationSignal = new CancellationSignal();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            BiometricPrompt.Builder builder = new BiometricPrompt.Builder(activity);
            builder.setTitle("দামের খাতা");
            builder.setSubtitle("আঙুলের ছাপ দিয়ে আনলক করুন");
            builder.setDescription("আপনার পরিচয় নিশ্চিত করতে আঙুলের ছাপ দিন");
            builder.setNegativeButton("PIN দিন", activity.getMainExecutor(), this);

            BiometricPrompt prompt = builder.build();
            prompt.authenticate(cancellationSignal, activity.getMainExecutor(), new BiometricPromptCallback(this));
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            FingerprintManager fm = (FingerprintManager) activity.getSystemService(Context.FINGERPRINT_SERVICE);
            if (fm != null) {
                fm.authenticate(null, cancellationSignal, 0, new FingerprintCallback(this), null);
            }
        }
    }

    @Override
    public void onClick(DialogInterface dialog, int which) {
        if (currentCallback != null) {
            currentCallback.onFailure("PIN_FALLBACK");
        }
    }

    private static class BiometricPromptCallback extends BiometricPrompt.AuthenticationCallback {
        private final BiometricHelper helper;

        BiometricPromptCallback(BiometricHelper helper) {
            this.helper = helper;
        }

        @Override
        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
            super.onAuthenticationSucceeded(result);
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onSuccess();
                }
            });
        }

        @Override
        public void onAuthenticationError(int errorCode, final CharSequence errString) {
            super.onAuthenticationError(errorCode, errString);
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onFailure(errString.toString());
                }
            });
        }

        @Override
        public void onAuthenticationFailed() {
            super.onAuthenticationFailed();
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onFailure("আঙুলের ছাপ মেলেনি!");
                }
            });
        }
    }

    private static class FingerprintCallback extends FingerprintManager.AuthenticationCallback {
        private final BiometricHelper helper;

        FingerprintCallback(BiometricHelper helper) {
            this.helper = helper;
        }

        @Override
        public void onAuthenticationSucceeded(FingerprintManager.AuthenticationResult result) {
            super.onAuthenticationSucceeded(result);
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onSuccess();
                }
            });
        }

        @Override
        public void onAuthenticationError(int errMsgId, final CharSequence errString) {
            super.onAuthenticationError(errMsgId, errString);
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onFailure(errString.toString());
                }
            });
        }

        @Override
        public void onAuthenticationFailed() {
            super.onAuthenticationFailed();
            helper.activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (helper.currentCallback != null) helper.currentCallback.onFailure("আঙুলের ছাপ মেলেনি!");
                }
            });
        }
    }

    public void cancel() {
        if (cancellationSignal != null && !cancellationSignal.isCanceled()) {
            cancellationSignal.cancel();
        }
    }
}
