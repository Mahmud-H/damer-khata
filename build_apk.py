# -*- coding: utf-8 -*-
"""
Damer Khata - Android APK Build & Sign Script
Compiles Android app without Gradle, signs with v1+v2+v3 signature.
"""
import os, subprocess, shutil, sys, zipfile

BASE_DIR = r"C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata"
APP_DIR = os.path.join(BASE_DIR, "app")
SRC_DIR = os.path.join(APP_DIR, "src", "main")
JAVA_SRC = os.path.join(SRC_DIR, "java")
RES_DIR = os.path.join(SRC_DIR, "res")
ASSETS_DIR = os.path.join(SRC_DIR, "assets")
MANIFEST = os.path.join(SRC_DIR, "AndroidManifest.xml")

BUILD_DIR = os.path.join(BASE_DIR, "build_tmp")
RELEASE_DIR = os.path.join(BASE_DIR, "release")
os.makedirs(BUILD_DIR, exist_ok=True)
os.makedirs(RELEASE_DIR, exist_ok=True)

JAVA_HOME = r"C:\Users\Mahmud\.vscode\extensions\redhat.java-1.56.0-win32-x64\jre\21.0.12.1-win32-x86_64"
SDK_DIR = r"C:\Users\Mahmud\AndroidSdk"
BUILD_TOOLS = os.path.join(SDK_DIR, "build-tools", "34.0.0")

AAPT2 = os.path.join(BUILD_TOOLS, "aapt2.exe")
D8 = os.path.join(BUILD_TOOLS, "d8.bat")
ZIPALIGN = os.path.join(BUILD_TOOLS, "zipalign.exe")
APKSIGNER = os.path.join(BUILD_TOOLS, "apksigner.bat")
ANDROID_JAR = os.path.join(SDK_DIR, "platforms", "android-34", "android.jar")
JAVAC = os.path.join(JAVA_HOME, "bin", "javac.exe")
JARSIGNER = os.path.join(JAVA_HOME, "bin", "jarsigner.exe")
KEYTOOL = os.path.join(JAVA_HOME, "bin", "keytool.exe")

ENV = os.environ.copy()
ENV["JAVA_HOME"] = JAVA_HOME
ENV["ANDROID_HOME"] = SDK_DIR
ENV["PATH"] = os.path.join(JAVA_HOME, "bin") + ";" + ENV.get("PATH", "")

print("=== STEP 1: Generate Release Keystore ===")
KEYSTORE = os.path.join(RELEASE_DIR, "damer-khata.jks")
ALIAS = "damerkhata"
STOREPASS = "damer1234"
KEYPASS = "damer1234"

if not os.path.exists(KEYSTORE):
    cmd_key = [
        KEYTOOL, "-genkeypair", "-v",
        "-keystore", KEYSTORE,
        "-alias", ALIAS,
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-storepass", STOREPASS,
        "-keypass", KEYPASS,
        "-dname", "CN=DamerKhata, OU=Retail, O=BelaboShop, L=Belabo, ST=Narsingdi, C=BD"
    ]
    subprocess.run(cmd_key, check=True, env=ENV)
    print("Keystore generated at:", KEYSTORE)
else:
    print("Keystore already exists at:", KEYSTORE)

print("\n=== STEP 2: Compile Resources with AAPT2 ===")
RES_ZIP = os.path.join(BUILD_DIR, "resources.zip")
if os.path.exists(RES_ZIP):
    os.remove(RES_ZIP)

cmd_aapt_compile = [AAPT2, "compile", "--dir", RES_DIR, "-o", RES_ZIP]
subprocess.run(cmd_aapt_compile, check=True, env=ENV)
print("Resources compiled.")

print("\n=== STEP 3: Link Resources and Generate R.java ===")
GEN_DIR = os.path.join(BUILD_DIR, "gen")
shutil.rmtree(GEN_DIR, ignore_errors=True)
os.makedirs(GEN_DIR, exist_ok=True)

UNALIGNED_APK = os.path.join(BUILD_DIR, "unaligned.apk")
if os.path.exists(UNALIGNED_APK):
    os.remove(UNALIGNED_APK)

cmd_aapt_link = [
    AAPT2, "link",
    "-I", ANDROID_JAR,
    "-A", ASSETS_DIR,
    "--manifest", MANIFEST,
    "--java", GEN_DIR,
    "-o", UNALIGNED_APK,
    RES_ZIP,
    "--auto-add-overlay"
]
subprocess.run(cmd_aapt_link, check=True, env=ENV)
print("Resources linked. Unaligned APK generated.")

print("\n=== STEP 4: Compile Java Sources with Javac ===")
CLASSES_DIR = os.path.join(BUILD_DIR, "classes")
shutil.rmtree(CLASSES_DIR, ignore_errors=True)
os.makedirs(CLASSES_DIR, exist_ok=True)

java_files = []
for root, _, files in os.walk(JAVA_SRC):
    for f in files:
        if f.endswith(".java"):
            java_files.append(os.path.join(root, f))
for root, _, files in os.walk(GEN_DIR):
    for f in files:
        if f.endswith(".java"):
            java_files.append(os.path.join(root, f))

cmd_javac = [
    JAVAC,
    "-parameters",
    "-source", "8",
    "-target", "8",
    "-bootclasspath", ANDROID_JAR,
    "-d", CLASSES_DIR
] + java_files
subprocess.run(cmd_javac, check=True, env=ENV)
print(f"Compiled {len(java_files)} Java files.")

print("\n=== STEP 5: Dex Classes with D8 ===")
DEX_DIR = os.path.join(BUILD_DIR, "dex")
shutil.rmtree(DEX_DIR, ignore_errors=True)
os.makedirs(DEX_DIR, exist_ok=True)

class_files = []
for root, _, files in os.walk(CLASSES_DIR):
    for f in files:
        if f.endswith(".class"):
            class_files.append(os.path.join(root, f))

cmd_d8 = [
    D8,
    "--min-api", "24",
    "--lib", ANDROID_JAR,
    "--output", DEX_DIR
] + class_files
subprocess.run(cmd_d8, check=True, env=ENV, shell=True)
print(f"Dex generated with {len(class_files)} class files.")

print("\n=== STEP 6: Add DEX to APK ===")
dex_path = os.path.join(DEX_DIR, "classes.dex")
with zipfile.ZipFile(UNALIGNED_APK, 'a') as apk_zip:
    apk_zip.write(dex_path, "classes.dex")
print("classes.dex added to APK.")

print("\n=== STEP 7: Zipalign APK ===")
ALIGNED_APK = os.path.join(BUILD_DIR, "aligned.apk")
if os.path.exists(ALIGNED_APK):
    os.remove(ALIGNED_APK)

cmd_zipalign = [ZIPALIGN, "-p", "-f", "4", UNALIGNED_APK, ALIGNED_APK]
subprocess.run(cmd_zipalign, check=True, env=ENV)
print("APK 4-byte aligned.")

print("\n=== STEP 8: Sign APK with v1 (jarsigner) + v2 + v3 (apksigner) ===")
# 8a: v1 signing with jarsigner
cmd_jarsigner = [
    JARSIGNER, "-verbose", "-sigalg", "SHA256withRSA", "-digestalg", "SHA-256",
    "-keystore", KEYSTORE,
    "-storepass", STOREPASS,
    "-keypass", KEYPASS,
    ALIGNED_APK, ALIAS
]
subprocess.run(cmd_jarsigner, check=True, env=ENV)
print("v1 JAR signature applied.")

# 8b: v2 + v3 signing with apksigner
FINAL_APK = os.path.join(RELEASE_DIR, "damer-khata.apk")
if os.path.exists(FINAL_APK):
    os.remove(FINAL_APK)

cmd_sign = [
    APKSIGNER, "sign",
    "--ks", KEYSTORE,
    "--ks-pass", f"pass:{STOREPASS}",
    "--key-pass", f"pass:{KEYPASS}",
    "--ks-key-alias", ALIAS,
    "--v1-signing-enabled", "true",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    "--out", FINAL_APK,
    ALIGNED_APK
]
subprocess.run(cmd_sign, check=True, env=ENV, shell=True)
print("APK Signed with v1, v2, and v3 signatures.")

print("\n=== STEP 9: Verify APK Signatures ===")
cmd_verify = [APKSIGNER, "verify", "--verbose", "--min-sdk-version", "23", FINAL_APK]
res = subprocess.run(cmd_verify, capture_output=True, text=True, env=ENV, shell=True)
print("Verification output:\n", res.stdout)
if res.stderr:
    print("Verification errors:\n", res.stderr)

print(f"\nSUCCESS! Signed APK generated at: {FINAL_APK}")
print(f"APK Size: {os.path.getsize(FINAL_APK)} bytes ({os.path.getsize(FINAL_APK) / (1024*1024):.2f} MB)")
