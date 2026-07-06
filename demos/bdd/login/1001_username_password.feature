@REQ-1001 @REQ-3718 @authentication @login
Feature: Username and Password Login
  As an existing customer
  I want to log in using my username and password
  So that I can access my account securely from any device

  Background:
    Given I am on the username and password login screen
    And both the username and password fields are empty

  @happy-path
  Scenario: Successful login navigates to home screen
    When I enter a valid username
    And I enter the correct password
    And I tap 'Sign in'
    Then an inline 'Login successful!' message is shown
    And I am automatically navigated to the app home screen within approximately 1 second
    And the failed attempt counter for my username is cleared

  @happy-path
  Scenario: Migrated user logs in with non-email username
    When I enter my existing The Bank username in non-email format
    And I enter the correct password
    And I tap 'Sign in'
    Then authentication succeeds
    And I am navigated to the home screen

  @happy-path
  Scenario: Loading state shown during authentication
    When I enter valid credentials and tap 'Sign in'
    Then the button label changes to 'Signing in...'
    And the button is disabled to prevent duplicate submissions
    And a loading state is shown while authentication is in progress

  @unhappy-path
  Scenario: Empty fields prevent submission
    When I tap 'Sign in' with either field empty
    Then I see: 'Please enter both username and password.'
    And the button returns to its active state

  @unhappy-path
  Scenario: Invalid credentials show error without disclosing attempt count
    When I enter an incorrect username and password combination
    And I tap 'Sign in'
    Then I see: 'Invalid username or password. Please try again.'
    And no information about remaining attempts is shown to the user

  @unhappy-path @lockout
  Scenario: Account locked after 3 consecutive failed attempts
    Given I have failed login 2 times with this username
    When I enter incorrect credentials and tap 'Sign in' again
    Then I see: 'Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.'
    And the account is locked for 30 minutes server-side

  @unhappy-path @lockout
  Scenario: Account suspended after 3 consecutive lockout cycles
    Given my account has been locked 3 times consecutively
    When I attempt to log in again after the lockout period
    Then my account is suspended
    And I must contact the Contact Centre for manual re-enablement

  @unhappy-path
  Scenario: Network error during authentication allows retry
    When a network error occurs during authentication
    Then an error message is shown
    And I can retry by tapping 'Sign in' again

  @unhappy-path
  Scenario: Session expires while login flow is active
    Given my session times out while I am on the login screen
    Then I am redirected to the login screen
    And any unsaved progress is lost

  @edge-case
  Scenario: Quick login expired banner shown when arriving from expired session
    Given I arrived at this screen from a 'Quick Login Expired' state
    Then an amber banner is shown: 'Quick Login Expired. For your security, please sign in again with your email and password.'

  @edge-case
  Scenario: Biometric shortcut preserves partially entered form data
    Given I have partially entered my username
    When I tap the biometric login shortcut button
    Then the biometric flow is initiated
    And the partially entered form data is preserved if I return

  @edge-case
  Scenario: No full-screen success page shown
    When authentication succeeds
    Then the transition from login screen to home screen is direct
    And no separate full-screen success page is shown

  @edge-case
  Scenario: Rapid screen taps during success state do not cause duplicate navigation
    When the 'Login successful!' message is shown
    And I rapidly tap the screen multiple times
    Then no duplicate navigation events are triggered

  @security
  Scenario: Password field is always masked — no show/hide toggle
    When I am on the login screen
    Then the password field is masked at all times
    And no show/hide toggle is shown
