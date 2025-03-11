# Makefile for My Jira Tickets Chrome Extension
# Generates a ZIP file for Chrome Web Store upload

# Variables
EXTENSION_NAME = my-jira-tickets
ZIP_FILE = $(EXTENSION_NAME).zip
SOURCES = manifest.json popup.html popup.js utils.js background.js icons/*

# Default target
all: $(ZIP_FILE)

# Create the ZIP file
$(ZIP_FILE): $(SOURCES)
	@echo "Creating ZIP file: $(ZIP_FILE)"
	@zip -r $(ZIP_FILE) $(SOURCES)
	@echo "ZIP file created successfully!"

# Clean up generated files
clean:
	@echo "Cleaning up..."
	@rm -f $(ZIP_FILE)
	@echo "Cleanup complete!"

# Phony targets
.PHONY: all clean
