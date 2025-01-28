from typing import List

def format_ticket_numbers(numbers: List[int]) -> str:
    """
    Convert a list of ticket numbers into a condensed range format.
    Example: [1,2,3,5,6,8] becomes "#1-#3, #5-#6, #8"
    """
    if not numbers:
        return ""
    
    numbers = sorted(numbers)
    ranges = []
    range_start = numbers[0]
    prev = numbers[0]
    
    for i in range(1, len(numbers) + 1):
        if i == len(numbers) or numbers[i] != prev + 1:
            ranges.append(f"#{range_start}" if range_start == prev else f"#{range_start}-#{prev}")
            if i < len(numbers):
                range_start = numbers[i]
                prev = numbers[i]
        else:
            prev = numbers[i]
    
    return ", ".join(ranges) 