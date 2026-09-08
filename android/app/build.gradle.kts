plugins {
    id("com.android.application")
}

android {
    namespace = "com.hukkle.heungyanggi"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hukkle.heungyanggi"
        minSdk = 24
        targetSdk = 35
        versionCode = 4
        versionName = "59.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
