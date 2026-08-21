#include "track_analyser/metrics.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>

namespace track_analyser {
namespace {

[[nodiscard]] std::vector<double> finite_sorted(std::span<const double> values) {
    std::vector<double> sorted;
    sorted.reserve(values.size());
    std::ranges::copy_if(values, std::back_inserter(sorted), [](double value) {
        return std::isfinite(value);
    });
    std::ranges::sort(sorted);
    return sorted;
}

}  // namespace

double percentile(std::span<const double> values, double probability) {
    const auto sorted = finite_sorted(values);
    if (sorted.empty()) {
        return std::numeric_limits<double>::quiet_NaN();
    }
    const auto bounded_probability = std::clamp(probability, 0.0, 1.0);
    const auto index = static_cast<double>(sorted.size() - 1) * bounded_probability;
    const auto lower_index = static_cast<std::size_t>(std::floor(index));
    const auto upper_index = static_cast<std::size_t>(std::ceil(index));
    const auto fraction = index - static_cast<double>(lower_index);
    return sorted[lower_index] + (sorted[upper_index] - sorted[lower_index]) * fraction;
}

Statistics statistics(std::span<const double> values) {
    const auto sorted = finite_sorted(values);
    if (sorted.empty()) {
        return {};
    }
    const auto count = sorted.size();
    const auto mean = std::accumulate(sorted.begin(), sorted.end(), 0.0) / static_cast<double>(count);
    const auto squared_sum = std::accumulate(sorted.begin(), sorted.end(), 0.0, [](double sum, double value) {
        return sum + value * value;
    });
    const auto variance_sum = std::accumulate(sorted.begin(), sorted.end(), 0.0, [mean](double sum, double value) {
        const auto delta = value - mean;
        return sum + delta * delta;
    });
    return {
        .count = count,
        .minimum = sorted.front(),
        .maximum = sorted.back(),
        .mean = mean,
        .median = percentile(sorted, 0.5),
        .p90 = percentile(sorted, 0.90),
        .p95 = percentile(sorted, 0.95),
        .p99 = percentile(sorted, 0.99),
        .rms = std::sqrt(squared_sum / static_cast<double>(count)),
        .variance = variance_sum / static_cast<double>(count),
    };
}

std::vector<double> derivative(
    std::span<const double> timestamps_seconds,
    std::span<const double> values
) {
    if (timestamps_seconds.size() != values.size()) {
        throw std::invalid_argument("Les horodatages et les valeurs doivent avoir la même taille.");
    }
    if (values.size() < 2) {
        return {};
    }
    std::vector<double> result;
    result.reserve(values.size() - 1);
    for (std::size_t index = 1; index < values.size(); ++index) {
        const auto delta_time = timestamps_seconds[index] - timestamps_seconds[index - 1];
        result.push_back(delta_time > 0.0
            ? (values[index] - values[index - 1]) / delta_time
            : std::numeric_limits<double>::quiet_NaN());
    }
    return result;
}

double cumulative_positive_gain(std::span<const double> values) {
    double gain = 0.0;
    for (std::size_t index = 1; index < values.size(); ++index) {
        gain += std::max(0.0, values[index] - values[index - 1]);
    }
    return gain;
}

}  // namespace track_analyser
