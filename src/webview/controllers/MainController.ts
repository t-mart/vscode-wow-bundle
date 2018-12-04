
import * as angular from 'angular'
import * as Utils from '../utils'
import { ISettingsService } from '../services/settings.service'
import { EThemeNames, ICategoryDescription, IEditableRule, IEditableSettings, IEditableThemes, settingsCategories } from '../settings'
import { VSCode } from '../../shared'

export const wbMainController: Utils.NGRegistrable = {
    register: (parent: ng.IModule) => parent.controller('MainController', MainController)
}

/*****************************************************************************
 * Implémentation du contrôleur
 *****************************************************************************/

// Les <option> pour le <select>
interface IThemeSelectOption {
    label: string       // Le nom du thème
    value: string       // Son ID entre [crochets]
    group: string       // Pour <optgroup>
    order: number       // ""      ""
}

type TThemeSelectOptionGroup = {
    [ kind: string ]: { label: string, order: number }
}

const themeSelectOptionGroups: TThemeSelectOptionGroup = {
    ['global']:   { label: 'All themes (global settings)', order: 1 },
    ['default']:  { label: 'Default theme',                order: 2 },   // Inutilisé, finalement..
    ['current']:  { label: 'Current theme',                order: 3 },
    ['vs']:       { label: 'Light themes',                 order: 4 },
    ['vs-dark']:  { label: 'Dark themes',                  order: 5 },
    ['hc-black']: { label: 'High-contrast themes',         order: 6 }
}

// Map { scope: règle } pour le thème sélectionné
interface IRulesMap {
    [ scopeName: string ]: IEditableRule
}

// Les règles telles qu'on les passe au template HTML
interface ITemplateRule {
    name: string
    description: string
    rule: IEditableRule
}

class MainController {

    // Catégories des réglages
    categories: ICategoryDescription[]
    selectedCategory: number
    selectedSection: number

    // Les réglages et les thèmes actuels
    editableSettings: IEditableSettings
    editableThemes: IEditableThemes
    currentTheme: string

    // Gestion du thème sélectionné
    themeSelectOptions: IThemeSelectOption[]    // Options du <select>
    selectedTheme: {
        name: string                            // Le nom du thème entre [crochets]
        rules: IEditableRule[]                  // Ses réglages
        scopes: IRulesMap                       // Son map { scope: règle }
    }

    // Les règles passées au template
    namedThemeRules: ITemplateRule[]

    // Constructeur
    static readonly $inject = [ 'settings.service', '$scope' ]
    constructor(private SettingsService: ISettingsService, private $scope: ng.IScope) {

        // Initialise les catégories
        this.categories = settingsCategories
        this.selectedCategory = 0
        this.selectedSection  = 0

        // Force buildThemeSelectOptions() à commencer avec le thème courant
        this.selectedTheme = {
            name: EThemeNames.NONE,
            rules: [],
            scopes: {}
        }

        // S'abonne aux réglages et aux thèmes
        this.SettingsService.installedThemes$.subscribe(newThemes => this.vscodeThemesChanged(newThemes))
        this.SettingsService.currentTheme$.subscribe(newCurrentTheme => this.vscodeCurrentThemeChanged(newCurrentTheme))
        this.SettingsService.editorSettings$.subscribe(newSettings => this.vscodeSettingsChanged(newSettings))
    }

    // Appelé quand la liste des thèmes installés dans VS Code a changé
    // Ne se produit qu'une fois à l'ouverture du Webview puisqu'il faut redémarrer
    // VS Code pour installer / désinstaller un thème. Mais on fait comme si
    // la liste pouvait changer à tout instant.
    private vscodeThemesChanged(newThemes: IEditableThemes) {
        this.$scope.$applyAsync( () => {
            this.editableThemes = newThemes
            this.buildThemeSelectOptions()
            this.selectedThemeChanged()
        })
    }

    // Appelé quand le thème courant a été changé dans VS Code
    private vscodeCurrentThemeChanged(newCurrentTheme: string) {
        this.$scope.$applyAsync( () => {
            this.currentTheme = newCurrentTheme
            this.buildThemeSelectOptions()
        })
    }

    // Appelé quand les réglages ont changé côté VS Code
    private vscodeSettingsChanged(newSettings: IEditableSettings) {
        this.$scope.$applyAsync( () => {
            this.editableSettings = newSettings
            this.selectedThemeChanged()
        })
    }

    // Construit les options du <select> d'après la liste des thèmes installés
    private buildThemeSelectOptions() {
        this.themeSelectOptions = []

        // Ne fait rien tant qu'on n'a pas reçu la liste des thèmes et le thème courant
        if (this.editableThemes && this.currentTheme) {

            // Commence avec les options 'global' et 'current'
            let current = this.editableThemes.find(t => t.id === this.currentTheme)
            if (!current) {
                current = {
                   id:    VSCode.DefaultTheme.id,
                   label: VSCode.DefaultTheme.label,
                   type:  VSCode.DefaultTheme.uiTheme
               }
            }

            this.themeSelectOptions.push(
                {
                    label: 'Global settings',
                    value: EThemeNames.GLOBAL,
                    group: themeSelectOptionGroups.global.label,
                    order: themeSelectOptionGroups.global.order
                },
                {
                    label: current.label,
                    value: EThemeNames.bracketed(current.id),
                    group: themeSelectOptionGroups.current.label,
                    order: themeSelectOptionGroups.current.order
                }
            )

            // Ajoute tous les autres thèmes
            for (const theme of this.editableThemes) {
                if (theme.id !== current.id) {
                    this.themeSelectOptions.push({
                        label: theme.label,
                        value: EThemeNames.bracketed(theme.id),
                        group: themeSelectOptionGroups[theme.type].label,
                        order: themeSelectOptionGroups[theme.type].order
                    })
                }
            }

            // Trie les options par groupe (pour <ng-options>), puis par nom au sein de chaque groupe
            this.themeSelectOptions.sort( (opt1, opt2) => `${opt1.order}:${opt1.label}`.localeCompare(`${opt2.order}:${opt2.label}`))

            // Si le thème précédemment édité n'est plus disponible, on revient au thème actuel de VS Code
            if (this.selectedTheme.name !== EThemeNames.GLOBAL) {
                const name = EThemeNames.unbracketed(this.selectedTheme.name)
                if (!this.editableThemes.find(theme => theme.id === name)) {
                    this.selectedTheme.name = EThemeNames.bracketed(current.id)
                }
            }
        }
    }

    // Construit le hash { scope: règle } d'après les règles du thème sélectionné
    private buildSelectedThemeRulesMap() {
        if (this.editableSettings) {
            this.selectedTheme.rules = this.editableSettings[this.selectedTheme.name] || []
            this.selectedTheme.scopes = {}
            for (const rule of this.selectedTheme.rules) {
                if (!rule.flags) {
                    rule.flags = {
                        setForeground: Utils.isColor(rule.settings.foreground),
                        setBackground: Utils.isColor(rule.settings.background),
                        setFontStyle:  Utils.isStyle(rule.settings.fontStyle)
                    }
                }
                this.selectedTheme.scopes[rule.scope] = rule
            }
        }
    }

    // Appelé par le <select> quand un thème a été sélectionné
    selectedThemeChanged() {
        this.buildSelectedThemeRulesMap()
        this.sectionChanged(this.selectedCategory, this.selectedSection)
    }

    // Appelé quand on change de catégorie/section affichée
    sectionChanged(category: number, section: number) {
        this.selectedCategory = category
        this.selectedSection  = section
        this.namedThemeRules  = []

        const sectionRules = this.categories[category].sections[section].rules
        for (const ruleInfo of sectionRules) {

            // Trouve la règle dans le thème, ou l'y ajoute si elle n'y est pas
            let rule = this.selectedTheme.scopes[ruleInfo.scope]
            if (!rule) {
                rule = {
                    scope: ruleInfo.scope,
                    settings: {
                        foreground: '',
                        background: '',
                        fontStyle: ''
                    },
                    flags: {
                        setForeground: false,
                        setBackground: false,
                        setFontStyle: false
                    }
                }
                this.selectedTheme.rules.push(rule)
                this.selectedTheme.scopes[ruleInfo.scope] = rule
            }

            // Crée sa version étendue pour le template
            this.namedThemeRules.push({
                name: ruleInfo.name,
                description: ruleInfo.description,
                rule
            })
        }
    }

    // Appelé quand une règle est modifiée dans le <wb-rule-editor>
    // (rappel: le composant n'a que la partie IEditableRule de la règle)
    ruleChanged(rule: IEditableRule, index: number) {

        // Met à jour notre modèle interne pour cette règle
        this.namedThemeRules[index].rule = rule

        // Met à jour la règle dans le map du thème sélectionné
        angular.merge(this.selectedTheme.scopes[rule.scope], rule)

        // Met à jour la règle dans VS Code
        this.SettingsService.putRule(this.selectedTheme.name, rule)
    }

    // Permet d'afficher les règles générées
    showDebug: boolean = false
    showDebugFiltered: boolean = true
    get generatedRules() {
        let settings: any = this.SettingsService.getRawSettings()
        if (this.showDebugFiltered) {
            const name = this.selectedTheme.name
            if (name !== EThemeNames.GLOBAL) {
                settings = settings[name] || {}
            }
            settings = settings.textMateRules || []
        }

        return settings
    }

    get generatedRulesLabel() {
        let label = 'tokenColorCustomizations'
        if (this.showDebugFiltered) {
            label += (this.selectedTheme.name === EThemeNames.GLOBAL ? '' : `["${this.selectedTheme.name}"]`) + '.textMateRules'
        }
        return label
    }
}
