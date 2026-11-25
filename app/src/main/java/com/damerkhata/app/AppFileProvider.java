package com.damerkhata.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class AppFileProvider extends ContentProvider {

    public static final String AUTHORITY = "com.damerkhata.app.fileprovider";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = getFileForUri(uri);
        if (file == null || !file.exists()) {
            // For writing (e.g. camera output), create parent dirs and file if needed
            if (mode != null && mode.contains("w") && file != null) {
                file.getParentFile().mkdirs();
            } else {
                throw new FileNotFoundException("File not found for URI: " + uri);
            }
        }
        int pMode = ParcelFileDescriptor.MODE_READ_ONLY;
        if (mode != null) {
            if (mode.contains("w")) {
                pMode = ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE;
            }
            if (mode.contains("rw")) {
                pMode = ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE;
            }
        }
        return ParcelFileDescriptor.open(file, pMode);
    }

    private File getFileForUri(Uri uri) {
        String path = uri.getPath();
        if (path == null) return null;
        if (path.startsWith("/")) path = path.substring(1);

        File baseDir;
        if (path.startsWith("camera_photos/")) {
            baseDir = getContext().getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES);
            path = path.substring("camera_photos/".length());
        } else if (path.startsWith("cache_photos/")) {
            baseDir = getContext().getCacheDir();
            path = path.substring("cache_photos/".length());
        } else {
            baseDir = getContext().getFilesDir();
            if (path.startsWith("internal_files/")) {
                path = path.substring("internal_files/".length());
            }
        }
        return new File(baseDir, path);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = getFileForUri(uri);
        if (projection == null) {
            projection = new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        }
        MatrixCursor cursor = new MatrixCursor(projection, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String col : projection) {
            if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                row.add(file != null ? file.getName() : "file");
            } else if (OpenableColumns.SIZE.equals(col)) {
                row.add(file != null ? file.length() : 0);
            } else {
                row.add(null);
            }
        }
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        String path = uri.getPath();
        if (path != null) {
            if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".json")) return "application/json";
        }
        return "application/octet-stream";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
