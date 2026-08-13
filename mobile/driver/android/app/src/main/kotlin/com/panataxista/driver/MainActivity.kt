package com.panataxista.driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createTripAlertChannel()
        logApiKey()
    }

    private fun logApiKey() {
        try {
            val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            val key = info.metaData?.getString("com.google.android.geo.API_KEY") ?: "NO ENCONTRADA"
            val preview = if (key.length > 10) "${key.take(8)}...${key.takeLast(4)}" else key
            Log.i("PANA_API_KEY", "API KEY en uso: $preview (longitud: ${key.length})")
        } catch (e: Exception) {
            Log.e("PANA_API_KEY", "Error leyendo API key: $e")
        }
    }

    private fun createTripAlertChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return

        if (manager.getNotificationChannel("trip_alert") != null) return

        val soundUri = Uri.parse(
            "android.resource://${packageName}/raw/trip_alert"
        )

        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            "trip_alert",
            "Alertas de viaje",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notificaciones de nuevos viajes disponibles"
            enableVibration(true)
            setSound(soundUri, audioAttrs)
        }

        manager.createNotificationChannel(channel)
    }
}