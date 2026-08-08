function isForwardedTypeParameter(typeArgument, typeParameter) {
  return (
    typeArgument.type === 'TSTypeReference' &&
    typeArgument.typeName.type === 'Identifier' &&
    typeArgument.typeName.name === typeParameter.name.name &&
    !typeArgument.typeArguments
  );
}

function isPassThroughTypeAlias(node) {
  if (node.typeAnnotation.type !== 'TSTypeReference' || node.typeAnnotation.typeName.type !== 'Identifier') {
    return false;
  }

  const typeParameters = node.typeParameters?.params ?? [];
  const typeArguments = node.typeAnnotation.typeArguments?.params ?? [];
  return (
    typeParameters.length === typeArguments.length &&
    typeParameters.every((typeParameter, index) => isForwardedTypeParameter(typeArguments[index], typeParameter))
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const noPassThroughTypeAlias = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow type aliases that only rename another type' },
    messages: { passThroughAlias: 'Use {{typeName}} directly instead of creating a pass-through type alias.' },
    schema: [],
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (isPassThroughTypeAlias(node)) {
          context.report({
            data: { typeName: node.typeAnnotation.typeName.name },
            messageId: 'passThroughAlias',
            node,
          });
        }
      },
    };
  },
};

export default noPassThroughTypeAlias;
