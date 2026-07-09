@REQ-2551 @REQ-2550 @authentication @migration @SCA
Feature: Migrated User — Username Verification and Password Creation
  As a user who has been migrated from The Bank
  I want to enter my The Bank username and verify my identity
  So that I can set up my new The Bank credentials

  Background:
    Given I tapped 'Migrated from The Bank?' on the login screen
    And I have already completed TIN verification on the Welcome Screen
    And I am on the Enter Your The Bank Username screen

  @happy-path
  Scenario: Valid username matched and OTP sent
    When I enter my existing The Bank username
    And the username matches my CBS record
    And I tap 'Continue'
    Then an OTP is sent to my registered phone via SMS
    And I am advanced to the OTP verification screen

  @happy-path
  Scenario: Successful OTP verification advances to Create New Password
    Given I have completed username entry and received an OTP
    When I enter the correct 6-digit OTP
    Then I am advanced to the Create New Password screen
    And the SCA-compliant process is complete

  @happy-path
  Scenario: Successful password creation hands off to First Time Login
    Given I am on the Create New Password screen for migration
    When I enter a valid password meeting all 5 complexity rules
    And I enter the same password in the confirm field
    And I tap 'Continue'
    Then I am handed off to the First Time Login setup flow
    And the Terms and Conditions screen is shown

  @happy-path
  Scenario: Non-email username format accepted for migrated user
    When I enter a The Bank username in non-email format
    Then it is accepted as valid
    And the server performs full format validation

  @unhappy-path
  Scenario: Username too short shows inline error
    When I enter a username with fewer than 3 characters
    Then an inline error message appears
    And 'Continue' remains inactive

  @unhappy-path
  Scenario: TIN does not match any The Bank account
    When my TIN does not match any The Bank account in the CBS
    Then I see: 'We could not verify your details. Please check your TIN or contact the Support Centre.'
    And I cannot proceed

  @unhappy-path @lockout
  Scenario: OTP verification locked after 3 failed attempts
    Given I have failed OTP verification 2 times
    When I enter an incorrect OTP for the 3rd time
    Then the migration flow is locked for 30 minutes
    And I see: 'Too many failed attempts. Please try again later or contact the Support Centre.'

  @unhappy-path
  Scenario: Network error during verification allows retry
    When a network error occurs during TIN or username verification
    Then an error message is shown
    And I can retry from this step

  @security @SCA
  Scenario: Migration flow satisfies SCA with two factors
    Given I have completed TIN and username matching
    And I have completed OTP verification
    Then the knowledge element of SCA is satisfied by TIN and username match
    And the possession element is satisfied by OTP delivery to registered device
    And the password creation step is authorised

  @security
  Scenario: Username becomes The Bank Bank login credential after verification
    Given I have completed the migration flow successfully
    Then my The Bank username becomes my The Bank Bank login credential
    And it can be used on the standard login screen going forward

  @edge-case
  Scenario: Forgot username link on migration screen opens recovery flow
    When I tap 'Forgot username?' on the migration screen
    Then I am taken to the username recovery flow
    And I can return from there to the migration screen

  @edge-case
  Scenario: Back button returns to login screen
    When I tap the back button on the username entry screen
    Then I am returned to the login screen

  # Password creation rules — identical to §1.14 merged feature
  @security
  Scenario: Breach check applied during migration password creation
    When I enter a breached password that meets all complexity rules
    Then I see: 'This password has appeared in a data breach. Please choose a different one.'
    And submission is blocked

  @security
  Scenario: Username-in-password rejected with generic message
    When I enter a password incorporating my username
    Then I see: 'This password configuration is not permitted. Please choose a different one.'
