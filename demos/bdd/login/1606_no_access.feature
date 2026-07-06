@REQ-1606 @authentication @recovery @support
Feature: I Don't Have Access — Support Contact Panel
  As a user who cannot access their registered phone number
  I want to tap 'I don't have access to any of these'
  So that I can find a way to contact The Bank for help

  Background:
    Given I am on the verification method selection screen
    And the 'I don't have access to any of these' link is visible at the bottom

  @happy-path
  Scenario: Tapping link opens the support contact bottom panel
    When I tap "I don't have access to any of these"
    Then a bottom panel slides up with title 'Contact The Bank'
    And an explanatory message is shown
    And the 'Customer Support Line' header is shown with 'Available 24/7'
    And the main support phone number is shown as a tap-to-call link
    And the toll-free number is shown as a tap-to-call link
    And an X close button is shown in the top-right of the panel

  @happy-path
  Scenario: Tapping a phone number initiates a call
    Given the support panel is open
    When I tap either phone number
    Then a call is initiated directly from the app
    And I do not need to copy the number manually

  @happy-path
  Scenario: X button dismisses the panel
    Given the support panel is open
    When I tap the X button
    Then the panel is dismissed
    And I am returned to the method selection screen

  @happy-path
  Scenario: Tapping outside the panel dismisses it
    Given the support panel is open
    When I tap the dark backdrop outside the panel
    Then the panel is dismissed
    And I am returned to the method selection screen

  @edge-case
  Scenario: Panel cannot be dismissed any other way
    Given the support panel is open
    Then it can only be dismissed via the X button or the backdrop
    And no swipe-down gesture is required
