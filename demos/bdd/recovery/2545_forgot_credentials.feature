@REQ-2545 @REQ-2546 @authentication @recovery
Feature: Forgot Username or Password — Entry and Recovery Choice
  As a user who cannot remember their username or password
  I want to tap 'Forgot username or password?' and choose what I need help with
  So that I can recover my credentials and regain access

  Background:
    Given I am on the login screen
    And the 'Forgot username or password?' link is visible below the login form

  @happy-path
  Scenario: Link visible and functional regardless of active login method
    Given I am viewing the Fast PIN login screen
    Then the 'Forgot username or password?' link is visible
    And tapping it opens the recovery choice screen

  @happy-path
  Scenario: Recovery choice screen shows two options
    When I tap 'Forgot username or password?'
    Then I see the title 'Forgot username or password?'
    And the subtitle 'Select what you need help with'
    And a card labelled 'Forgot my username' with description 'Recover your username via SMS'
    And a card labelled 'Forgot my password' with description 'Reset your password via SMS'
    And a back button in the top-left corner

  @happy-path
  Scenario: Tapping Forgot my username navigates to username recovery flow
    When I tap 'Forgot username or password?'
    And I tap the 'Forgot my username' card
    Then I am taken to the username recovery flow immediately
    And no loading state is shown on the choice screen

  @happy-path
  Scenario: Tapping Forgot my password navigates to password reset flow
    When I tap 'Forgot username or password?'
    And I tap the 'Forgot my password' card
    Then I am taken to the password reset flow immediately

  @happy-path
  Scenario: Back button returns to login screen
    When I tap 'Forgot username or password?'
    And I tap the back button
    Then I am returned to the login screen

  @unhappy-path
  Scenario: Daily recovery limit reached — both cards blocked
    Given the user has already used their daily recovery allowance
    When I tap the 'Forgot my username' card
    Then I see: 'Daily recovery limit reached. Please contact the Support Centre.'
    And I cannot proceed with either recovery path

  @unhappy-path
  Scenario: Account temporarily blocked due to suspicious recovery attempts
    Given 3 or more suspicious recovery attempts were detected in the last 60 minutes
    When I open the recovery choice screen
    Then I see: 'Your account has been temporarily locked. Please wait or contact the Support Centre.'

  @security
  Scenario: Only one recovery path can be initiated per session
    Given I have already initiated a password reset in this session
    When I view the recovery choice screen again
    Then the 'Forgot my username' card is disabled for this session
    And I see an explanation that only one recovery path can be active at a time

  @security
  Scenario: Channel separation enforced between username and password recovery
    Given I am initiating username recovery via SMS
    Then the password reset must use a different channel if initiated simultaneously

  @unhappy-path
  Scenario: Recovery flow fails to load after tapping a card
    When I tap either recovery card and the flow fails to load
    Then I remain on the recovery choice screen
    And no partial navigation occurs

  @edge-case
  Scenario: User navigates back from recovery choice to login at any time
    Given I am on the recovery choice screen
    When I tap the back button
    Then I return to the login screen
