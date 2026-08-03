import Flutter
import UIKit
import AVFoundation

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var audioPlayer: AVAudioPlayer?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let controller = engineBridge.pluginRegistry as! FlutterViewController
    let channel = FlutterMethodChannel(
      name: "com.panataxista.driver/audio",
      binaryMessenger: controller.binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      switch call.method {
      case "playAlertSound":
        guard let url = Bundle.main.url(forResource: "trip_alert", withExtension: "wav") else {
          result(FlutterError(code: "NOT_FOUND", message: "trip_alert.wav not found", details: nil))
          return
        }
        do {
          try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
          try AVAudioSession.sharedInstance().setActive(true)
          self?.audioPlayer = try AVAudioPlayer(contentsOf: url)
          self?.audioPlayer?.numberOfLoops = -1
          self?.audioPlayer?.play()
          result(nil)
        } catch {
          result(FlutterError(code: "AUDIO_ERROR", message: error.localizedDescription, details: nil))
        }
      case "stopAlertSound":
        self?.audioPlayer?.stop()
        self?.audioPlayer = nil
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }
}
