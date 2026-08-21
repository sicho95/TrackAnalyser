#include "track_analyser/metrics.hpp"

#include <array>
#include <cassert>
#include <cmath>

int main() {
    constexpr std::array values{1.0, 2.0, 3.0, 4.0, 5.0};
    const auto summary = track_analyser::statistics(values);
    assert(summary.count == 5);
    assert(std::abs(summary.mean - 3.0) < 1e-12);
    assert(std::abs(summary.median - 3.0) < 1e-12);
    assert(std::abs(summary.p95 - 4.8) < 1e-12);

    constexpr std::array timestamps{0.0, 1.0, 3.0};
    constexpr std::array positions{0.0, 2.0, 8.0};
    const auto speeds = track_analyser::derivative(timestamps, positions);
    assert(speeds.size() == 2);
    assert(std::abs(speeds[0] - 2.0) < 1e-12);
    assert(std::abs(speeds[1] - 3.0) < 1e-12);

    constexpr std::array altitudes{100.0, 105.0, 103.0, 110.0};
    assert(std::abs(track_analyser::cumulative_positive_gain(altitudes) - 12.0) < 1e-12);
    return 0;
}
