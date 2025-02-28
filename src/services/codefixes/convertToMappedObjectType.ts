/* @internal */
namespace ts.codefix {
    const fixIdAddMissingTypeof = "fixConvertToMappedObjectType";
    const fixId = fixIdAddMissingTypeof;
    const errorCodes = [Diagnostics.An_index_signature_parameter_type_cannot_be_a_literal_type_or_generic_type_Consider_using_a_mapped_object_type_instead.code];

    type FixableDeclaration = InterfaceDeclaration | TypeAliasDeclaration;

    registerCodeFix({
        errorCodes,
        getCodeActions: context => {
            const { sourceFile, span } = context;
            const info = getInfo(sourceFile, span.start);
            if (!info) return undefined;
            const changes = textChanges.ChangeTracker.with(context, t => doChange(t, sourceFile, info));
            const name = idText(info.container.name);
            return [createCodeFixAction(fixId, changes, [Diagnostics.Convert_0_to_mapped_object_type, name], fixId, [Diagnostics.Convert_0_to_mapped_object_type, name])];
        },
        fixIds: [fixId],
        getAllCodeActions: context => codeFixAll(context, errorCodes, (changes, diag) => {
            const info = getInfo(diag.file, diag.start);
            if (info) doChange(changes, diag.file, info);
        })
    });

    interface Info { readonly indexSignature: IndexSignatureDeclaration; readonly container: FixableDeclaration; }
    function getInfo(sourceFile: SourceFile, pos: number): Info | undefined {
        const token = getTokenAtPosition(sourceFile, pos);
        const indexSignature = cast(token.parent.parent, isIndexSignatureDeclaration);
        if (isClassDeclaration(indexSignature.parent)) return undefined;
        const container = isInterfaceDeclaration(indexSignature.parent) ? indexSignature.parent : cast(indexSignature.parent.parent, isTypeAliasDeclaration);
        return { indexSignature, container };
    }

    function createTypeAliasFromInterface(declaration: FixableDeclaration, type: TypeNode): TypeAliasDeclaration {
        return factory.createTypeAliasDeclaration(declaration.decorators, declaration.modifiers, declaration.name, declaration.typeParameters, type);
    }

    function doChange(changes: textChanges.ChangeTracker, sourceFile: SourceFile, { indexSignature, container }: Info): void {
        const members = isInterfaceDeclaration(container) ? container.members : (container.type as TypeLiteralNode).members;
        const otherMembers = members.filter(member => !isIndexSignatureDeclaration(member));
        const parameter = first(indexSignature.parameters);
        const mappedTypeParameter = factory.createTypeParameterDeclaration(cast(parameter.name, isIdentifier), parameter.type);
        const mappedIntersectionType = factory.createMappedTypeNode(
            hasEffectiveReadonlyModifier(indexSignature) ? factory.createModifier(SyntaxKind.ReadonlyKeyword) : undefined,
            mappedTypeParameter,
            /*nameType*/ undefined,
            indexSignature.questionToken,
            indexSignature.type,
            /*members*/ undefined);
        const intersectionType = factory.createIntersectionTypeNode([
            ...getAllSuperTypeNodes(container),
            mappedIntersectionType,
            ...(otherMembers.length ? [factory.createTypeLiteralNode(otherMembers)] : emptyArray),
        ]);
        changes.replaceNode(sourceFile, container, createTypeAliasFromInterface(container, intersectionType));
    }
}
