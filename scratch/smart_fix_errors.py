import re
import os

CANDIDATES = {
    "m": ["model", "matchedMachine", "modelName", "modalityEntry", "mediaItem", "modelDetail"],
    "q": ["quantizationKey", "quantLabel", "bestKeys", "normalizedSearch"],
    "g": ["quantGroup"],
    "v": ["vramValue", "parsedValue", "storedWidth", "sortValue", "grayscaleValue", "videoElement"],
    "n": ["modelCount", "matchedNode", "parsedWidth", "updatedState", "updatedSet"],
    "t": ["tokensPerSecond", "touchState", "threadMessage", "interpolation", "huePosition", "benchmarkTarget", "thinkingTag"],
    "w": ["canvasWidth", "strokeWidth", "mid", "scaledWidth"],
    "h": ["canvasHeight", "hexClean", "hourLabel", "strokeHeight", "formattedHour"],
    "f": ["fractionalPart", "toolsTag"],
    "p": ["providerData", "providerKey", "currentProps"],
    "d": ["contextData", "memoryDate", "benchmarkData", "audioDuration"],
    "c": ["contextLength", "conversationEntry", "colorCode"],
    "a": ["downloadAnchor", "agentTag"],
    "s": ["skills", "mcpServers", "animationState", "dt", "currentState", "currentSettings"]
}

def find_replacement_backward(file_lines, start_line_idx, old_var):
    candidates = CANDIDATES.get(old_var, [])
    if not candidates:
        return None
        
    # Search backwards from the line before the error line
    for idx in range(start_line_idx - 1, -1, -1):
        line = file_lines[idx]
        
        # Check if any candidate is declared on this line
        for candidate in candidates:
            # Match declarations: const candidate, let candidate, candidate =>, (candidate) =>, .map(candidate, .forEach(candidate
            pattern = r'\b(const|let|var|function)\s+' + re.escape(candidate) + r'\b|\b' + re.escape(candidate) + r'\s*=>|\.map\(\s*\(?\s*' + re.escape(candidate) + r'\b|\.forEach\(\s*\(?\s*' + re.escape(candidate) + r'\b|' + re.escape(candidate) + r'\s*:[^=]+=|\b' + re.escape(candidate) + r'\b'
            
            # Since we want to find where the candidate was declared/introduced, let's look for definitions or assignments
            if re.search(r'\b(const|let|var)\s+' + re.escape(candidate) + r'\b|\b' + re.escape(candidate) + r'\s*=>|\.map\(\s*\(?\s*' + re.escape(candidate) + r'\b|\.forEach\(\s*\(?\s*' + re.escape(candidate) + r'\b', line):
                return candidate
                
    # Fallback to the first candidate if none found
    if candidates:
        return candidates[0]
    return None

def run_smart_fix(errors_path):
    with open(errors_path, 'r', encoding='utf-8') as f:
        content = f.read()

    error_pattern = re.compile(r'^(\S+)\((\d+),\d+\): error TS2304: Cannot find name \'([a-zA-Z0-9_$]+)\'\.$')
    
    file_cache = {}
    fixed_count = 0
    skipped_count = 0
    
    lines = content.split('\n')
    for line in lines:
        match = error_pattern.match(line)
        if not match:
            continue
            
        file_path = match.group(1)
        line_num = int(match.group(2))
        var_name = match.group(3)
        
        # Load file into cache
        if file_path not in file_cache:
            full_path = os.path.join('/home/rodrigo/development/prism-client', file_path)
            if not os.path.exists(full_path):
                continue
            with open(full_path, 'r', encoding='utf-8') as f_in:
                file_cache[file_path] = f_in.readlines()
                
        file_lines = file_cache[file_path]
        if line_num <= 0 or line_num > len(file_lines):
            continue
            
        target_line = file_lines[line_num - 1]
        
        # Find the correct descriptive replacement variable by looking backward
        replacement = find_replacement_backward(file_lines, line_num - 1, var_name)
        
        if not replacement:
            print(f"Skipped {file_path}:{line_num} | No replacement candidate found for {var_name}")
            skipped_count += 1
            continue
            
        # Replace the single letter word with the replacement descriptive word
        new_line, count = re.subn(r'\b' + re.escape(var_name) + r'\b', replacement, target_line)
        if count > 0:
            file_lines[line_num - 1] = new_line
            fixed_count += 1
            print(f"Fixed {file_path}:{line_num} | {var_name} -> {replacement}")
        else:
            skipped_count += 1
            
    # Save all modified files
    for file_path, file_lines in file_cache.items():
        full_path = os.path.join('/home/rodrigo/development/prism-client', file_path)
        with open(full_path, 'w', encoding='utf-8') as f_out:
            f_out.writelines(file_lines)
            
    print(f"\nSmart-fix finished: {fixed_count} fixed, {skipped_count} skipped.")

if __name__ == '__main__':
    run_smart_fix('/home/rodrigo/development/prism-client/tsc_errors.txt')
