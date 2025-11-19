#!/usr/bin/env python3
"""
Test if Daily.init() works without Rust panic on x86_64
"""

import sys
sys.path.insert(0, '/app')

def test_daily_init():
    print("Testing Daily.init()...")
    try:
        from daily import Daily
        print("✓ Daily import successful")

        Daily.init()
        print("✓ Daily.init() successful - NO RUST PANIC!")

        Daily.deinit()
        print("✓ Daily.deinit() successful")

        return True
    except Exception as e:
        print(f"✗ Daily test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_daily_init()
    sys.exit(0 if success else 1)
