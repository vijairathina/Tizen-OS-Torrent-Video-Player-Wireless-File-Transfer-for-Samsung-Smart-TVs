pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TVFileHubMultiPlatform"

include(":core")
project(":core").projectDir = file("core")

include(":phone")
project(":phone").projectDir = file("phone")

include(":tv")
project(":tv").projectDir = file("tv")

include(":auto")
project(":auto").projectDir = file("auto")
