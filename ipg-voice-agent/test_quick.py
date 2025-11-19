#!/usr/bin/env python3
"""
Quick validation script for DailyTransport without full rebuild.
Run: python test_quick.py
"""

import sys
sys.path.insert(0, '/app')

def test_daily_transport():
    """Test DailyTransport implementation"""
    print("🧪 Testing DailyTransport...")

    # Test 1: Import
    try:
        from app.daily_transport import DailyTransport
        print("✓ Import successful")
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False

    # Test 2: Check required methods
    required_methods = {
        'input': 'property',
        'output': 'property',
        'set_parent': 'method',
        'link': 'method',
        'can_generate_metrics': 'method',
        'process_frame': 'method',
        'start': 'method',
        'stop': 'method'
    }

    for method_name, method_type in required_methods.items():
        if not hasattr(DailyTransport, method_name):
            print(f"✗ Missing {method_type} {method_name}")
            return False
        print(f"✓ {method_type.capitalize()} {method_name} exists")

    # Test 3: Check method signatures
    import inspect
    try:
        sig = inspect.signature(DailyTransport.can_generate_metrics)
        print(f"✓ can_generate_metrics signature: {sig}")

        sig = inspect.signature(DailyTransport.process_frame)
        print(f"✓ process_frame signature: {sig}")
    except Exception as e:
        print(f"✗ Signature check failed: {e}")
        return False

    print("\n✅ All tests passed!")
    return True

if __name__ == "__main__":
    success = test_daily_transport()
    sys.exit(0 if success else 1)
