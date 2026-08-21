cmake_minimum_required(VERSION 3.20)
project(track_analyser_analytics VERSION 1.0.0 LANGUAGES CXX)

option(TRACK_ANALYSER_BUILD_TESTS "Construire les tests natifs" ON)
option(TRACK_ANALYSER_BUILD_WASM "Construire le module WebAssembly" OFF)

add_library(track_analytics STATIC
    cpp/src/metrics.cpp
)
target_include_directories(track_analytics PUBLIC cpp/include)
target_compile_features(track_analytics PUBLIC cxx_std_20)
target_compile_options(track_analytics PRIVATE -Wall -Wextra -Wpedantic)

if(TRACK_ANALYSER_BUILD_TESTS)
    enable_testing()
    add_executable(track_analytics_tests cpp/tests/metrics_test.cpp)
    target_link_libraries(track_analytics_tests PRIVATE track_analytics)
    add_test(NAME track_analytics_tests COMMAND track_analytics_tests)
endif()

if(EMSCRIPTEN AND TRACK_ANALYSER_BUILD_WASM)
    add_executable(track_analytics_wasm cpp/src/wasm_api.cpp)
    target_link_libraries(track_analytics_wasm PRIVATE track_analytics)
    set_target_properties(track_analytics_wasm PROPERTIES
        OUTPUT_NAME "track-analytics"
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/wasm/dist"
    )
    target_link_options(track_analytics_wasm PRIVATE
        "--no-entry"
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sENVIRONMENT=web,worker,node"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sEXPORTED_FUNCTIONS=['_ta_mean','_ta_rms','_ta_percentile','_malloc','_free']"
        "-sEXPORTED_RUNTIME_METHODS=['cwrap']"
    )
endif()
