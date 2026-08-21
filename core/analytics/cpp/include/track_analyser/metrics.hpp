#pragma once

#include <cstddef>
#include <span>
#include <vector>

namespace track_analyser {

struct Statistics {
    std::size_t count{};
    double minimum{};
    double maximum{};
    double mean{};
    double median{};
    double p90{};
    double p95{};
    double p99{};
    double rms{};
    double variance{};
};

[[nodiscard]] double percentile(std::span<const double> values, double probability);
[[nodiscard]] Statistics statistics(std::span<const double> values);
[[nodiscard]] std::vector<double> derivative(
    std::span<const double> timestamps_seconds,
    std::span<const double> values
);
[[nodiscard]] double cumulative_positive_gain(std::span<const double> values);

}  // namespace track_analyser

