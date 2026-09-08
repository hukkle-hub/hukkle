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
        versionCode = 2
        versionName = "57.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
