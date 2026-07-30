# New Features

## Feature: Storage Management 

Use Cases:
    Use Case: User asks how much flash is used & available.
    Use Case: User wants to download the log file.
    Use Case: User wants to download the config file.
    Use Case: User edits the config file.
    Use Case: User uploads edited config file.

- Storage Features
-- Get local file system stats (extend overseer::platform::storage)  
-- Get File(s) on FS
-- Get/Put/Delete file (extend)
-- Note: Log actions

- Extend Firmware

- REST API 
-- Expose new Storage Features 

- Dashboard
New Advanced Feature "Advanced Remote Management" 

*How*
*Implement with REST & Device features*
Add new "Advanced" subpage under "Settings"  
use Side Menu & a Tree View as file picker
Page title/header label "Log & File Management"

-- 
## Feature: VictronEnergy Integration
Use Cases:
read main KPIs (state of charge, battery level, and current) 

*How*
Add new Connection in Settings for VRM
