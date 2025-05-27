// This is a demo feature file that demonstrates various BDD step patterns

Feature: BDD Demo

  Scenario: Basic step patterns
    Given a user is logged in
    When the user performs an action
    Then the expected result is observed

  Scenario: Steps with parameters
    Given a user "johndoe" with role "admin"
    When the user uploads a file "document.pdf" of size 1024 KB
    Then the file is processed successfully

  Scenario: Object state steps
    Given the Object state is initialized
    When the Object state is changed
    Then the Object state is checked
