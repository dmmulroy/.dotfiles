# dot benchmark-shell: time Fish startup over several runs.

cmd_benchmark_shell_usage() {
    cat << USAGE
USAGE:
    ${SCRIPT_NAME} benchmark-shell [-r NUM] [-v]

OPTIONS:
    -r, --runs NUM      Number of runs (1-100, default: 10)
    -v, --verbose       Show each timing
USAGE
}

cmd_benchmark_shell() {
    __print_header "Benchmarking Fish shell startup performance"
    
    # Check if Fish is installed
    if ! __command_exists fish; then
        __print_error "Fish shell is not installed"
        __print_info "Install Fish shell first: brew install fish"
        return 1
    fi
    
    # Parse options
    local runs=10
    local verbose=false
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -r|--runs)
                runs="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -h|--help)
                cmd_benchmark_shell_usage
                return 0
                ;;
            *)
                __print_error "Unknown option: $1"
                __print_info "Run '${SCRIPT_NAME} benchmark-shell --help' for usage"
                return 1
                ;;
        esac
    done
    
    # Validate number of runs
    if ! [[ "$runs" =~ ^[0-9]+$ ]] || [[ "$runs" -lt 1 ]] || [[ "$runs" -gt 100 ]]; then
        __print_error "Number of runs must be between 1 and 100"
        return 1
    fi
    
    __print_info "Running $runs Fish shell startup benchmarks..."
    
    # Create temporary script that exits immediately
    local temp_script
    temp_script=$(mktemp -t DOT_fish_benchmark_XXXXXX.fish)
    if [[ -z "$temp_script" ]]; then
        __print_error "Failed to create temp file"
        return 1
    fi
    # Clean up on return and immediately remove this function-local trap. If
    # the trap survives until main returns, nounset expands an out-of-scope
    # temp_script variable and turns a successful benchmark into an error.
    trap 'rm -f "$temp_script"; trap - RETURN' RETURN
    echo "exit 0" > "$temp_script"
    
    # Array to store timing results
    local times=()
    local total_time=0
    
    # Run benchmarks using a more sophisticated approach
    for i in $(seq 1 "$runs"); do
        if [[ "$verbose" == true ]]; then
            __print_info "Run $i/$runs..."
        fi
        
        # Use python for high-precision timing if available, otherwise use perl
        local elapsed
        if command -v python3 >/dev/null 2>&1; then
            elapsed=$(python3 -c "
import time
import subprocess
import sys
start = time.time()
try:
    subprocess.run(['fish', '$temp_script'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    end = time.time()
    print(f'{end - start:.3f}')
except:
    print('0.001')
")
        elif command -v perl >/dev/null 2>&1; then
            elapsed=$(perl -e "
use Time::HiRes 'time';
my \$start = time();
system('fish', '$temp_script', '>/dev/null', '2>&1');
my \$end = time();
printf '%.3f', \$end - \$start;
")
        else
            # Fallback to basic approach
            SECONDS=0
            fish "$temp_script" >/dev/null 2>&1
            elapsed="$SECONDS"
            if [[ "$elapsed" == "0" ]]; then
                elapsed="0.001"
            fi
        fi
        
        # Ensure elapsed is a valid number
        if [[ -z "$elapsed" ]] || ! [[ "$elapsed" =~ ^[0-9]*\.?[0-9]+$ ]]; then
            elapsed="0.001"
        fi
        
        times+=("$elapsed")
        if command -v bc >/dev/null 2>&1; then
            total_time=$(echo "$total_time + $elapsed" | bc -l)
        else
            total_time=$(echo "$total_time $elapsed" | awk '{print $1 + $2}')
        fi
        
        if [[ "$verbose" == true ]]; then
            printf "  Run %2d: %.3f seconds\n" "$i" "$elapsed"
        fi
    done
    
    # Calculate statistics
    local avg_time
    if command -v bc >/dev/null 2>&1; then
        avg_time=$(echo "scale=3; $total_time / $runs" | bc -l)
    else
        avg_time=$(echo "$total_time $runs" | awk '{printf "%.3f", $1/$2}')
    fi
    
    # Find min and max times
    local min_time="${times[0]}"
    local max_time="${times[0]}"
    
    for time in "${times[@]}"; do
        if command -v bc >/dev/null 2>&1; then
            if (( $(echo "$time < $min_time" | bc -l) )); then
                min_time="$time"
            fi
            if (( $(echo "$time > $max_time" | bc -l) )); then
                max_time="$time"
            fi
        else
            # Fallback for systems without bc
            if [[ $(echo "$time $min_time" | awk '{print ($1 < $2)}') == 1 ]]; then
                min_time="$time"
            fi
            if [[ $(echo "$time $max_time" | awk '{print ($1 > $2)}') == 1 ]]; then
                max_time="$time"
            fi
        fi
    done
    
    # Generate custom report
    __print_header "Fish Shell Startup Benchmark Results"
    echo ""
    echo -e "${BOLD}Configuration:${RESET}"
    echo "  Shell: $(fish --version)"
    echo "  Runs: $runs"
    echo "  Test: Empty script execution"
    echo ""
    
    echo -e "${BOLD}Performance Results:${RESET}"
    printf "  Average time: ${GREEN}%.3f${RESET} seconds\n" "$avg_time"
    printf "  Fastest time: ${GREEN}%.3f${RESET} seconds\n" "$min_time"
    printf "  Slowest time: ${YELLOW}%.3f${RESET} seconds\n" "$max_time"
    
    if command -v bc >/dev/null 2>&1; then
        local range
        range=$(echo "scale=3; $max_time - $min_time" | bc -l)
        printf "  Time range:   ${CYAN}%.3f${RESET} seconds\n" "$range"
    fi
    
    echo ""
    echo -e "${BOLD}Performance Assessment:${RESET}"
    
    # Performance thresholds (in seconds)
    local excellent=0.050
    local good=0.100
    local fair=0.200
    
    if command -v bc >/dev/null 2>&1; then
        if (( $(echo "$avg_time <= $excellent" | bc -l) )); then
            __print_success "Excellent startup performance! (≤50ms)"
        elif (( $(echo "$avg_time <= $good" | bc -l) )); then
            __print_success "Good startup performance (≤100ms)"
        elif (( $(echo "$avg_time <= $fair" | bc -l) )); then
            __print_warning "Fair startup performance (≤200ms)"
        else
            __print_warning "Slow startup performance (>200ms)"
            echo ""
            __print_info "Tips to improve Fish shell startup time:"
            __print_info "  - Review Fish config.fish for expensive operations"
            __print_info "  - Consider lazy-loading plugins and functions"
            __print_info "  - Check for slow network operations in startup scripts"
            __print_info "  - Use 'fish --profile-startup /tmp/fish-startup.profile -ic exit' to identify startup bottlenecks"
        fi
    else
        # Fallback assessment without bc
        if [[ $(echo "$avg_time 0.050" | awk '{print ($1 <= $2)}') == 1 ]]; then
            __print_success "Excellent startup performance! (≤50ms)"
        elif [[ $(echo "$avg_time 0.100" | awk '{print ($1 <= $2)}') == 1 ]]; then
            __print_success "Good startup performance (≤100ms)"
        elif [[ $(echo "$avg_time 0.200" | awk '{print ($1 <= $2)}') == 1 ]]; then
            __print_warning "Fair startup performance (≤200ms)"
        else
            __print_warning "Slow startup performance (>200ms)"
        fi
    fi
    
    echo ""
    __print_info "To profile Fish startup in detail, run: fish --profile-startup /tmp/fish-startup.profile -ic exit"
    __print_info "Then inspect the slowest commands: sort -nr /tmp/fish-startup.profile | head -20"
    __print_info "Fish config location: ~/.config/fish/config.fish"
}
