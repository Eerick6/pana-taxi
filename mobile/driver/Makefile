run-dev:
	flutter run --dart-define-from-file=env/dev.json -t lib/main_dev.dart

run-pre:
	flutter run --dart-define-from-file=env/pre.json -t lib/main_pre.dart

run-prod:
	flutter run --dart-define-from-file=env/prod.json -t lib/main_prod.dart

build-apk-dev:
	flutter build apk --dart-define-from-file=env/dev.json -t lib/main_dev.dart --debug

build-apk-prod:
	flutter build apk --dart-define-from-file=env/prod.json -t lib/main_prod.dart --release

build-ios-dev:
	flutter build ios --dart-define-from-file=env/dev.json -t lib/main_dev.dart --debug --no-codesign

gen:
	dart run build_runner build --delete-conflicting-outputs

gen-watch:
	dart run build_runner watch --delete-conflicting-outputs

clean:
	flutter clean && flutter pub get
