@REQ-3719 @security @session @cross-cutting
Feature: Session Timeout - Automatic Logout
  As a logged-in user
  I want the app to automatically log me out after a period of inactivity
  So that my account is protected if I leave the app unattended

  Background:
    Given I am authenticated and on any protected screen
    And my session timer starts from 0 at login
    And the inactivity timeout is set to 15 minutes

  @happy-path
  Scenario: Session remains active during continuous interaction
    Given 14 minutes have passed since my last interaction
    When I tap anywhere on the screen
    Then my session timer resets to 0
    And I remain logged in

  @unhappy-path
  Scenario: Automatic logout after 15 minutes of inactivity
    Given 15 minutes have passed with no user interaction
    Then my session is terminated server-side
    And all locally cached user data is cleared
    And I am redirected to the login screen
    And I see the message "Your session has expired. Please log in again."

  @unhappy-path
  Scenario: Session expires while app is in background
    Given I put the app in the background
    And 15 minutes pass while the app is backgrounded
    When I bring the app back to the foreground
    Then I see the login screen
    And I see the message "Your session has expired. Please log in again."

  @unhappy-path @mid-flow
  Scenario Outline: Session expires during active flow
    Given I am in the middle of a <flow> flow
    When 15 minutes pass with no user interaction
    Then I am redirected to the login screen
    And all unsaved progress from the <flow> is lost
    And I must restart the <flow> after logging back in

    Examples:
      | flow         |
      | transfer     |
      | payment      |
      | OTP entry    |
      | profile edit |

  @unhappy-path @security
  Scenario: Session expires during OTP entry
    Given I am on an OTP verification screen
    When my session expires due to inactivity
    Then the OTP is invalidated server-side
    And I am redirected to the login screen
    And I must re-initiate the transaction from the beginning after logging back in

  @security @device-integrity
  Scenario: Device compromise check on app resume blocks transactions
    Given my session is still valid
    And I resume the app from background
    When the device integrity check fails on resume
    Then all payment and transfer flows are blocked for this session
    And I see the non-dismissible message "This device does not meet security requirements. Payment and transfer features are unavailable on this device. Please contact support."
    And the event is logged server-side with timestamp and device fingerprint

  @security @device-integrity
  Scenario: Device integrity check passes on resume
    Given my session is still valid
    And I resume the app from background
    When the device integrity check passes
    Then no interruption occurs
    And I continue from where I left off

  @edge-case
  Scenario: Passive screen viewing counts as inactivity
    Given I am viewing a static screen such as a statement
    And I have not tapped scrolled or typed for 15 minutes
    Then my session expires
    And I am redirected to the login screen

  @edge-case
  Scenario: Keystroke resets inactivity timer
    Given 14 minutes have passed since my last interaction
    When I type a single character in any input field
    Then my session timer resets to 0

  @edge-case
  Scenario: Notification shortcut after session expiry redirects to login first
    Given my session has expired
    When I tap a notification shortcut pointing to a protected screen
    Then I am redirected to the login screen
    And after successful login I am routed to the intended screen
