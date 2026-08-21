# Réutiliser le cœur C++ portable dans un composant ESP-IDF futur.
if(ESP_PLATFORM)
    idf_component_register(
        SRCS "../../core/analytics/cpp/src/metrics.cpp"
        INCLUDE_DIRS "../../core/analytics/cpp/include"
    )
    target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_20)
endif()
