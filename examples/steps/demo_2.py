from behave import given, then
from parse import parse


@then(parse('test with parse, "{single}" and double quotes'))
@given(parse('test with parse, "{single}" and double quotes'))
def test_with_parse_single_double_quotes(single):
     pass


@then(parse('test with parse, \"{single}\" and escaped quotes'))
def test_with_parse_single_escaped_quotes(single):
    pass


@then(parse("test with parse, '{double}' and single quotes"))
def test_with_parse_double_single_quotes(single):
    pass

