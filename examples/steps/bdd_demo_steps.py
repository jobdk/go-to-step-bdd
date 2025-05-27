# Consolidated step definitions for BDD demo
from pytest_bdd import given, when, then, parsers, parse

# Basic steps
@given("a user is logged in")
def user_is_logged_in():
    pass

@when("the user performs an action")
def user_performs_action():
    pass

@then("the expected result is observed")
def expected_result_observed():
    pass

# Parameter steps
@given(parse("a user \"{username}\" with role \"{role}\""))
def user_with_role(username, role):
    pass

@when(parse("the user uploads a file \"{filename}\" of size {size:d} KB"))
def user_uploads_file(filename, size):
    pass

@then("the file is processed successfully")
@then("the file is processed successfully")
def file_processed_successfully():
    pass

