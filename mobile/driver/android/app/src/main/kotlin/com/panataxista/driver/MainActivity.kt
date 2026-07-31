package com.panataxista.driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createTripAlertChannel()
    }

    private fun createTripAlertChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return

        // Solo crear si no existe — Android ignora createNotificationChannel si ya existe
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
