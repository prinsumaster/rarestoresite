import re
import os

filepath = 'index.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of var CATS = {
match = re.search(r'var\s+CATS\s*=\s*\{', content)
if match:
    start_idx = match.start()
    
    # Simple brace matching to find the end of the object
    open_braces = 0
    end_idx = -1
    in_string = False
    escape_next = False
    string_char = None
    
    for i in range(start_idx, len(content)):
        char = content[i]
        
        if escape_next:
            escape_next = False
            continue
            
        if char == '\\':
            escape_next = True
            continue
            
        if in_string:
            if char == string_char:
                in_string = False
        else:
            if char in ["'", '"', '`']:
                in_string = True
                string_char = char
            elif char == '{':
                open_braces += 1
            elif char == '}':
                open_braces -= 1
                if open_braces == 0:
                    end_idx = i + 1
                    # include trailing semicolon if present
                    while end_idx < len(content) and content[end_idx] in [' ', '\t', '\n', '\r']:
                        end_idx += 1
                    if end_idx < len(content) and content[end_idx] == ';':
                        end_idx += 1
                    break
                    
    if end_idx != -1:
        cats_data = content[start_idx:end_idx]
        
        # Write to data.js
        with open('data.js', 'w', encoding='utf-8') as f:
            f.write(cats_data)
            
        # Update index.html
        new_content = content[:start_idx] + '<script src="data.js"></script>\n' + content[end_idx:]
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print("Successfully extracted data.js!")
    else:
        print("Failed to find end of CATS object")
else:
    print("Could not find var CATS = {")
