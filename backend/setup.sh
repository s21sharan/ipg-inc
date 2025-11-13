#!/bin/bash

# Setup script for IPG Interview Agent Backend

echo "Creating virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "✓ Setup complete!"
echo ""
echo "To start the backend:"
echo "  1. Activate venv: source venv/bin/activate"
echo "  2. Run server: python main.py"
echo ""
