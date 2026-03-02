import os
import re

def replace_penalty_logic(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern to match the penalty block
    # Matches:
    # // Late check-in penalty: 15 minutes if check-in > 9:00 AM
    # const checkInSeconds = ...
    # const isLateCheckIn = ...
    # const penaltySeconds = isLateCheckIn ? (15 * 60) : 0;
    # (let|const) netWorkedSeconds = Math.max(0, netWorkedRaw - penaltySeconds);
    
    # We use a broad regex to capture the variable names used (r or record)
    # The record variable is usually found in the few lines before the penalty block
    # but we can also match it from common patterns.
    
    def replacement(match):
        indent = match.group(1)
        var_name_match = re.search(r'(record|r|apiAttendance)\.checkIn', content[max(0, match.start()-500):match.start()])
        var_name = var_name_match.group(1) if var_name_match else "record"
        
        declaration = match.group(2) # let or const
        
        return (f"{indent}// Late check-in penalty uses backend provided value\n"
                f"{indent}const penaltySeconds = {var_name}.penaltySeconds || 0;\n"
                f"{indent}{declaration} netWorkedSeconds = Math.max(0, netWorkedRaw - penaltySeconds);")

    pattern = re.compile(r'(\s+)// Late check-in penalty: 15 minutes if check-in > 9:00 AM\s+const checkInSeconds = [^\n]+\n\s+const isLateCheckIn = [^\n]+\n\s+const penaltySeconds = isLateCheckIn \? \(15 \* 60\) : 0;\s+(let|const) netWorkedSeconds = Math.max\(0, netWorkedRaw - penaltySeconds\);', re.MULTILINE)

    new_content = pattern.sub(replacement, content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Processed {file_path}")

# Run replacements
replace_penalty_logic(r"d:\26-02-HRMS\HRMS-frontend-KriraAI-\Hrms-client\pages\AdminDashboard.tsx")
replace_penalty_logic(r"d:\26-02-HRMS\HRMS-frontend-KriraAI-\Hrms-client\pages\HRDashboard.tsx")
replace_penalty_logic(r"d:\26-02-HRMS\HRMS-frontend-KriraAI-\Hrms-client\pages\EmployeeDashboard.tsx")
replace_penalty_logic(r"d:\26-02-HRMS\HRMS-frontend-KriraAI-\Hrms-client\pages\Analytics.tsx")
