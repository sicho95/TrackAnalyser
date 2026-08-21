#include "track_analyser/metrics.hpp"

#include <cstddef>
#include <span>

extern "C" {

double ta_mean(const double* values, std::size_t size) {
    return track_analyser::statistics(std::span(values, size)).mean;
}

double ta_rms(const double* values, std::size_t size) {
    return track_analyser::statistics(std::span(values, size)).rms;
}

double ta_percentile(const double* values, std::size_t size, double probability) {
    return track_analyser::percentile(std::span(values, size), probability);
}

}
